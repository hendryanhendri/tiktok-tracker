"use client";
/* eslint-disable @next/next/no-img-element */
import Hls from "hls.js";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FaArrowUpRightFromSquare,
  FaTriangleExclamation,
  FaVideo,
  FaHeadphones,
  FaGear,
  FaPlay,
  FaPause,
  FaVolumeHigh,
  FaVolumeXmark,
  FaBolt,
  FaForwardFast,
  FaRotate,
  FaSliders,
  FaChevronRight,
  FaChevronLeft,
  FaCheck,
  FaExpand,
  FaCompress,
  FaWindowRestore,
  FaCircleDot,
  FaStop,
  FaGift,
  FaVideoSlash,
  FaFloppyDisk,
} from "react-icons/fa6";
import type { IconType } from "react-icons";
import { API_URL } from "@/app/lib/config";
import LevelBadge from "@/app/components/LevelBadge";

export type Quality = {
  id: string;
  label: string;
  url: string;
  alts?: string[];
  height?: number;
  audioOnly?: boolean;
};
type Mode = "video" | "audio";
type Layout = "wide" | "mobile";

const isFlv = (u: string) => /\.flv(\?|$)/i.test(u);

/**
 * Nama kualitas seperti di menu TikTok: yang tertinggi "Original", sisanya angka resolusi (720p, 540p, 360p).
 * Bila label sudah berupa angka (dari metadata) dipakai apa adanya; bila berupa nama (LD/SD/HD) dipetakan ke tangga umum TikTok.
 */
function friendlyQuality(q: Quality): string {
  const l = q.label;
  if (/^\d+p$/i.test(l)) return l.toLowerCase();
  if (/full\s*hd|uhd/i.test(l)) return "1080p";
  if (/\bhd\b/i.test(l)) return "720p";
  if (/\bsd\b/i.test(l)) return "540p";
  if (/\bld\b|rendah/i.test(l)) return "360p";
  return l;
}

const fmtBytes = (n: number) => (n > 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);
const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const MEMORY_LIMIT = 500 * 1024 * 1024; // batas bila tak bisa menulis langsung ke disk

/** Satu baris menu pengaturan: ikon, label, nilai saat ini, dan panah (bila membuka submenu). Ukuran lega agar mudah diklik. */
function MenuRow({
  icon: Icon,
  label,
  value,
  valueAccent,
  chevron,
  active,
  onClick,
}: {
  icon: IconType;
  label: string;
  value?: string;
  valueAccent?: boolean;
  chevron?: boolean;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-3.5 rounded-xl px-4 py-3 text-left transition hover:bg-white/10 ${active ? "bg-white/10" : ""}`}
    >
      <Icon aria-hidden className="h-5 w-5 shrink-0 text-white/85" />
      <span className="flex-1">{label}</span>
      {value && <span className={`text-sm ${valueAccent ? "text-accent-2" : "text-white/55"}`}>{value}</span>}
      {chevron && <FaChevronRight aria-hidden className="h-3.5 w-3.5 text-white/55" />}
    </button>
  );
}

type GiftEvent = { key?: string; coins?: number; id: number; user?: string; gift?: string; count?: number; icon?: string; avatar?: string; level?: number };
/** Target/challenge gift yang sedang aktif di live (dari server). */
type GoalItem = { giftId: number; current: number; target: number; expiresAt: number | null; name?: string; icon?: string };
const mmss = (ms: number) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};
const GIFT_POPUP_MS = 6000;
const BIG_GIFT_COINS = 1000; // gift senilai >= ini memicu efek besar; >= 10.000 efek lebih lama (mega)
const GIFT_SIZE = "clamp(18px, 7cqw, 28px)"; // ukuran avatar/gambar gift, mengikuti lebar gambar video

/** Gambar gift; bila tidak ada/gagal dimuat, tampil ikon hadiah. Ukuran mengikuti lebar gambar video (satuan cqw). */
function GiftThumb({ src, size }: { src?: string; size: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <span className="flex shrink-0 items-center justify-center rounded-md bg-amber-400/15" style={{ width: size, height: size }}>
        <FaGift aria-hidden className="h-1/2 w-1/2 text-amber-300" />
      </span>
    );
  }
  return (
    <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="shrink-0 object-contain drop-shadow" style={{ width: size, height: size }} />
  );
}

export default function LivePlayer({
  qualities,
  username,
  thumbnail,
  initialMode = "video",
  plain = false,
  gifts,
  goals,
  ended = false,
  onClose,
  onLayoutChange,
}: {
  qualities: Quality[];
  username?: string;
  thumbnail?: string | null;
  initialMode?: "video" | "audio";
  /** Tampilan polos: hanya video + suara (tanpa toolbar, menu pengaturan, rekam, atau info teknis). */
  plain?: boolean;
  /** Daftar gift dari tracker (bila ada): ditampilkan sebagai notifikasi di atas video. */
  gifts?: GiftEvent[];
  /** Target/challenge gift aktif: ditampilkan sebagai bar progres di pojok kiri atas video. */
  goals?: GoalItem[];
  /** Live sudah berakhir (kabar dari server): pemutar dihentikan dan layar "Live telah berakhir" ditampilkan. */
  ended?: boolean;
  /** Tampilan polos: tombol Tutup di dalam pemutar (pojok kiri atas), karena form di atas disembunyikan. */
  onClose?: () => void;
  /** Dikabari saat bentuk tampilan berubah (lebar/mobile), agar halaman menyesuaikan tata letak di sekitarnya. */
  onLayoutChange?: (layout: Layout) => void;
}) {
  // Dua elemen video bergantian (double-buffer): kualitas baru dimuat di elemen yang tersembunyi sementara yang lama terus tampil,
  // lalu ditukar begitu video baru benar-benar jalan. videoRef selalu menunjuk elemen yang AKTIF (dipakai semua kontrol).
  const vidA = useRef<HTMLVideoElement>(null);
  const vidB = useRef<HTMLVideoElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const slotRef = useRef(0);
  const [slot, setSlot] = useState(0);
  const activeDestroyRef = useRef<(() => void) | null>(null); // pembongkar pemutar yang sedang aktif
  const [switchSlow, setSwitchSlow] = useState(false); // pergantian kualitas yang lama: tampilkan indikator kecil
  useEffect(() => {
    if (!videoRef.current) videoRef.current = vidA.current; // sebelum pemutar pertama dibuat, kontrol sudah punya elemen
  }, []);
  const stageRef = useRef<HTMLDivElement>(null);

  // Daftar masuk urut rendah -> tinggi.
  const videoQ = qualities.filter((q) => !q.audioOnly);
  const audioQ = qualities.find((q) => q.audioOnly);
  const lowestVideo = videoQ[0];
  // Seperti menu TikTok: Auto, Original, lalu tingkat di bawahnya (720p, 540p, 360p). Urut tertinggi -> terendah.
  const qOptions = [...videoQ].reverse();
  const qNames = new Map(qOptions.map((q, i) => [q.id, i === 0 ? "Original" : friendlyQuality(q)]));
  // Auto dimulai dari tingkat tertinggi (Original), sama seperti pemutar web TikTok; bila tersendat berulang, turun satu tingkat.
  const autoStart = 0;

  const [mode, setMode] = useState<Mode>(initialMode);
  const [videoId, setVideoId] = useState(videoQ.at(-1)?.id ?? qualities.at(-1)?.id ?? "");
  const [isAuto, setIsAuto] = useState(true); // pilihan "Auto" (default, seperti TikTok)
  const [autoIdx, setAutoIdx] = useState(autoStart);
  const autoBaseRef = useRef({ n: 0, t: 0 });
  const rawCandidatesRef = useRef<string[]>([]);
  const userRateRef = useRef(1); // kecepatan yang diminta pengguna/ekstensi (mis. Video Speed Controller)
  const [useProxy, setUseProxy] = useState(false);
  const [restartKey, setRestartKey] = useState(0); // dinaikkan oleh penjaga macet untuk memulai ulang pemutar
  useEffect(() => {
    // Buka koneksi ke server stream lebih awal (DNS + TLS) agar byte pertama datang lebih cepat.
    try {
      const u = rawCandidatesRef.current[0];
      if (u && /^https?:/i.test(u)) {
        const o = new URL(u).origin;
        if (!document.head.querySelector(`link[rel=preconnect][href="${o}"]`)) {
          const l = document.createElement("link");
          l.rel = "preconnect";
          l.href = o;
          l.crossOrigin = "anonymous";
          document.head.appendChild(l);
        }
      }
    } catch {
      /* abaikan */
    }
    void import("mpegts.js"); // unduh modul pemutar FLV di muka agar awal putar tidak menunggu
  }, []);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuView, setMenuView] = useState<"main" | "quality">("main");
  const menuRef = useRef<HTMLDivElement>(null);
  // Mode latensi rendah: buffer minimal + mengejar tepi live. Lebih "real-time", tetapi lebih mudah tersendat.
  const [lowLatency, setLowLatency] = useState(() => {
    try {
      return localStorage.getItem("tt-lowlat") === "1";
    } catch {
      return false;
    }
  });
  // Notifikasi gift di layar: hanya gift yang masuk setelah pemutar dibuka (riwayat lama tidak diputar ulang).
  // Target gift: hitung mundur tiap detik selama ada target; yang waktunya habis disembunyikan.
  const [nowMs, setNowMs] = useState(() => Date.now());
  const hasGoals = !!goals?.length;
  useEffect(() => {
    if (!hasGoals) return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [hasGoals]);
  const activeGoals = (goals ?? []).filter((g) => !g.expiresAt || g.expiresAt > nowMs).slice(0, 3);

  // Cara menyimpan rekaman: "download" = unduhan biasa di akhir (jalan di semua browser, termasuk Brave);
  // "disk" = tulis langsung ke disk lewat dialog simpan (hanya Chrome/Edge, aman untuk rekaman panjang, tapi Chrome menampilkan dialog izin).
  const [recMode, setRecMode] = useState<"download" | "disk">(() => {
    try {
      return localStorage.getItem("tt-recmode") === "disk" ? "disk" : "download";
    } catch {
      return "download";
    }
  });
  const toggleRecMode = () => {
    const next = recMode === "disk" ? "download" : "disk";
    setRecMode(next);
    try {
      localStorage.setItem("tt-recmode", next);
    } catch {
      /* abaikan */
    }
  };
  // HLS dengan beberapa tingkat di satu daftar (master playlist): pilihan kualitas diambil dari daftar itu (mis. Shopee).
  const hlsRef = useRef<Hls | null>(null);
  const [hlsLevels, setHlsLevels] = useState<{ i: number; h: number; kbps: number }[]>([]);
  const [levelSel, setLevelSel] = useState(-1); // -1 = otomatis
  const [giftOverlay, setGiftOverlay] = useState(() => {
    try {
      return localStorage.getItem("tt-giftov") !== "0";
    } catch {
      return true;
    }
  });
  const [giftPopups, setGiftPopups] = useState<GiftEvent[]>([]);
  const seenGiftRef = useRef<number | null>(null);
  // Efek gift besar: antrean (maks 3), diputar satu per satu.
  const [bigGift, setBigGift] = useState<GiftEvent | null>(null);
  const bigQueueRef = useRef<GiftEvent[]>([]);
  const bigBusyRef = useRef(false);
  const bigTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playNextBig = useCallback(() => {
    const next = bigQueueRef.current.shift();
    if (!next) {
      bigBusyRef.current = false;
      setBigGift(null);
      return;
    }
    bigBusyRef.current = true;
    setBigGift(next);
    bigTimerRef.current = setTimeout(playNextBig, (next.coins ?? 0) >= 10000 ? 7000 : 4500);
  }, []);
  const enqueueBig = useCallback(
    (g: GiftEvent) => {
      if (bigQueueRef.current.length < 3) bigQueueRef.current.push(g);
      if (!bigBusyRef.current) playNextBig();
    },
    [playNextBig],
  );
  useEffect(() => () => void (bigTimerRef.current && clearTimeout(bigTimerRef.current)), []);
  const popupTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    if (!gifts) return;
    const maxId = gifts.reduce((m, g) => Math.max(m, g.id), 0);
    if (seenGiftRef.current === null || gifts.length === 0) {
      seenGiftRef.current = maxId;
      return;
    }
    const fresh = gifts.filter((g) => g.id > (seenGiftRef.current ?? 0));
    seenGiftRef.current = maxId;
    if (!fresh.length) return;
    for (const g of fresh) if ((g.coins ?? 0) >= BIG_GIFT_COINS) enqueueBig(g);
    // Pengirim + gift yang sama digabung jadi satu notifikasi (jumlah dijumlahkan), maksimal 2 notifikasi sekaligus.
    setGiftPopups((prev) => {
      const next = [...prev];
      for (const g of fresh) {
        const key = `${g.user}|${g.gift}`;
        const n = g.count ?? 1;
        const i = next.findIndex((x) => x.key === key);
        if (i >= 0) next[i] = { ...next[i], count: (next[i].count ?? 1) + n, icon: next[i].icon || g.icon };
        else next.push({ ...g, key, count: n });
      }
      return next.slice(-2);
    });
    for (const g of fresh) {
      const key = `${g.user}|${g.gift}`;
      const old = popupTimersRef.current.get(key);
      if (old) clearTimeout(old);
      popupTimersRef.current.set(
        key,
        setTimeout(() => {
          popupTimersRef.current.delete(key);
          setGiftPopups((p) => p.filter((x) => x.key !== key));
        }, GIFT_POPUP_MS),
      );
    }
  }, [gifts, enqueueBig]);
  const toggleGiftOverlay = () => {
    const next = !giftOverlay;
    setGiftOverlay(next);
    try {
      localStorage.setItem("tt-giftov", next ? "1" : "0");
    } catch {
      /* abaikan */
    }
  };
  const [lag, setLag] = useState<number | null>(null); // perkiraan jeda: buffer di depan posisi putar (detik)
  const [playing, setPlaying] = useState(true);
  // Kontrol buatan sendiri: muncul saat mouse/sentuhan, hilang sendiri setelah 3 detik bila sedang diputar.
  const [ctlVisible, setCtlVisible] = useState(true);
  const ctlTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pokeControls = useCallback(() => {
    setCtlVisible(true);
    if (ctlTimerRef.current) clearTimeout(ctlTimerRef.current);
    ctlTimerRef.current = setTimeout(() => setCtlVisible(false), 3000);
  }, []);
  useEffect(() => () => void (ctlTimerRef.current && clearTimeout(ctlTimerRef.current)), []);
  const [vol, setVol] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [noVideo, setNoVideo] = useState(false); // stream tidak punya gambar (khusus audio / codec tak didukung)
  const mediaInfoRef = useRef<Record<string, unknown>>({}); // codec/resolusi yang dilaporkan flv.js / hls.js
  const statsRef = useRef({ waiting: 0, stalled: 0, errors: [] as string[] });
  const [copied, setCopied] = useState(false);
  const logRef = useRef<string[]>([]); // riwayat percobaan, tidak direset antar varian
  const t0Ref = useRef(0);
  const log = useCallback((m: string) => {
    if (!t0Ref.current) t0Ref.current = Date.now();
    logRef.current.push(`[+${((Date.now() - t0Ref.current) / 1000).toFixed(1)}s] ${m}`);
    if (logRef.current.length > 60) logRef.current.shift();
  }, []);
  const giveUpVideoRef = useRef(false); // sudah mencoba semua varian: berhenti berpindah, biarkan audio jalan
  const [variant, setVariant] = useState(0); // indeks URL cadangan untuk kualitas terpilih
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [slowLoad, setSlowLoad] = useState(false); // pergantian kualitas yang lama: baru tampilkan indikator
  const [layoutUser, setLayoutUser] = useState<Layout | null>(null); // pilihan orientasi pengguna (null = otomatis)
  const [isFs, setIsFs] = useState(false);
  const [canPip, setCanPip] = useState(false);
  const [failReason, setFailReason] = useState<string | null>(null);
  const [dims, setDims] = useState<string | null>(null); // resolusi yang benar-benar sedang diputar
  // Rekam (di browser, tanpa instalasi apa pun)
  type RecState = {
    kind: "video" | "audio";
    startedAt: number;
    toDisk: boolean;
  };
  const [rec, setRec] = useState<RecState | null>(null);
  const [recMsg, setRecMsg] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recBytesRef = useRef(0);
  const [needsTap, setNeedsTap] = useState(false); // autoplay diblokir total -> butuh klik
  const [autoMuted, setAutoMuted] = useState(false); // autoplay jalan tapi tanpa suara

  // Mode audio: format audio saja bila ada, kalau tidak video kualitas terendah (hemat data).
  const selected =
    mode === "audio"
      ? (audioQ ?? lowestVideo ?? qualities[0])
      : ((isAuto ? qOptions[Math.min(autoIdx, qOptions.length - 1)] : videoQ.find((q) => q.id === videoId)) ?? videoQ.at(-1) ?? qualities[0]);
  // FLV yang berisi HEVC/format tak terbaca oleh pemutar: setelah sekali gagal, utamakan HLS untuk live ini (termasuk saat ganti kualitas).
  const [flvBadIds, setFlvBadIds] = useState<string[]>([]);
  const selId = selected?.id;
  const flvBad = !!selId && flvBadIds.includes(selId);
  // Kualitas sebelum pergantian: bila kualitas baru gagal total, kembali ke sini (video tidak dibiarkan mati).
  const prevQRef = useRef<{ id: string; auto: boolean } | null>(null);
  const [qNotice, setQNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!qNotice) return;
    const t = setTimeout(() => setQNotice(null), 4000);
    return () => clearTimeout(t);
  }, [qNotice]);
  const rawCandidates = selected ? [selected.url, ...(selected.alts ?? [])] : [];
  rawCandidatesRef.current = rawCandidates;
  const hasHls = rawCandidates.some((u) => !isFlv(u));
  const candidates = flvBad ? [...rawCandidates.filter((u) => !isFlv(u)), ...rawCandidates.filter(isFlv)] : rawCandidates;
  const baseUrl = candidates[variant] ?? selected?.url ?? "";
  const src = baseUrl ? (useProxy ? `${API_URL}/proxy?u=${encodeURIComponent(baseUrl)}` : baseUrl) : "";
  const autoRef = useRef({ isAuto, idx: autoIdx, max: qOptions.length - 1 });
  autoRef.current = { isAuto, idx: autoIdx, max: qOptions.length - 1 };
  const audioModeRef = useRef(false);
  audioModeRef.current = mode === "audio";

  useEffect(() => {
    // Sudah ada pemutar aktif -> ganti kualitas "mulus": bangun yang baru di elemen satunya, yang lama tetap tampil sampai yang baru siap.
    const seamless = activeDestroyRef.current !== null;
    const targetSlot = seamless ? 1 - slotRef.current : slotRef.current;
    const video = (targetSlot === 0 ? vidA : vidB).current;
    if (!src || !video || ended) return;
    if (!seamless) {
      videoRef.current = video;
      setLoading(true);
      setNeedsTap(false);
      setAutoMuted(false);
      hlsRef.current = null;
      setHlsLevels([]);
      setLevelSel(-1);
    } else {
      video.muted = true; // senyap sampai ditukar, agar tidak ada suara ganda
    }
    setFailed(false);
    setFailReason(null);
    // dims sengaja TIDAK di-reset: ukuran gambar lama dipertahankan sampai yang baru diketahui, agar bentuk kartu/layout tidak melompat saat kualitas diganti.
    mediaInfoRef.current = {};
    statsRef.current = { waiting: 0, stalled: 0, errors: [] };
    log(`mulai: varian ${variant + 1}/${candidates.length} ${useProxy ? "via proxy" : "langsung"} (${isFlv(src) ? "FLV" : "HLS"})`);

    let cancelled = false;
    let destroy: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const failAll = (reason: string) => {
      const prev = prevQRef.current;
      if (prev && !cancelled) {
        // Kualitas yang baru dipilih tidak bisa diputar di browser ini: kembali ke yang tadi (bingkai terakhir tetap ditahan).
        prevQRef.current = null;
        log(`kualitas baru gagal (${reason.slice(0, 60)}) -> kembali ke ${prev.auto ? "Auto" : prev.id}`);
        setQNotice("Kualitas itu tidak bisa diputar di browser ini. Dikembalikan ke kualitas sebelumnya.");
        setIsAuto(prev.auto);
        setVideoId(prev.id);
        setVariant(0);
        setUseProxy(false);
        return;
      }
      const au = autoRef.current;
      if (au.isAuto && au.idx < au.max && !cancelled && !audioModeRef.current) {
        // Mode Auto: tingkat ini tidak bisa diputar (mis. HEVC) -> turun satu tingkat, bukan menampilkan kesalahan.
        log(`Auto: tingkat ini gagal (${reason.slice(0, 60)}), turun satu tingkat`);
        setAutoIdx(au.idx + 1);
        setVariant(0);
        setUseProxy(false);
        return;
      }
      activeDestroyRef.current?.(); // gagal total: jangan biarkan video lama tampil di bawah layar kesalahan
      activeDestroyRef.current = null;
      setSwitchSlow(false);
      setFailReason(reason || null);
      setFailed(true);
    };
    // Coba URL cadangan (varian lain dari kualitas yang sama), baru menyerah.
    const nextVariant = (reason: string) => {
      if (variant + 1 < candidates.length) {
        console.warn(`Player: varian ${variant + 1}/${candidates.length} gagal, mencoba varian berikutnya`);
        setVariant(variant + 1);
        setUseProxy(false);
      } else failAll(reason);
    };
    // Gagal: langsung -> proxy -> varian berikutnya -> menyerah. "hard" (404, tak didukung) langsung menyerah.
    const fail = (reason: string, hard = false) => {
      if (cancelled) return;
      console.warn("Player:", reason || "gagal, mencoba proxy");
      if (reason) statsRef.current.errors.push(reason.slice(0, 120));
      log(`GAGAL: ${reason || "(tanpa pesan, lanjut ke proxy)"}`);
      if (hard) return failAll(reason);
      if (!useProxy) return setUseProxy(true);
      nextVariant(reason);
    };
    let swapped = false;
    const slowTimer: ReturnType<typeof setTimeout> | null = seamless ? setTimeout(() => !cancelled && setSwitchSlow(true), 2500) : null;
    const onReady = (ev?: Event) => {
      // Pada pergantian mulus, tukar hanya saat benar-benar "playing" (gambar sudah berjalan), bukan saat baru "loadeddata".
      if (seamless && !swapped && ev?.type !== "playing") return;
      // Jangan menukar ke elemen yang hanya bersuara (tanpa gambar) selagi video lama masih punya gambar; varian lain dicoba oleh pemeriksa "tanpa gambar".
      if (seamless && !swapped && video.videoWidth === 0 && !audioModeRef.current && !giveUpVideoRef.current) return;
      if (!swapped && !cancelled) {
        swapped = true;
        const old = videoRef.current;
        if (seamless && old && old !== video) {
          video.muted = old.muted; // warisi suara/volume dari video lama
          video.volume = old.volume;
        }
        activeDestroyRef.current?.(); // bongkar pemutar lama (setelah yang baru siap)
        activeDestroyRef.current = () => destroy?.();
        videoRef.current = video;
        slotRef.current = targetSlot;
        setSlot(targetSlot);
      }
      if (slowTimer) clearTimeout(slowTimer);
      setSwitchSlow(false);
      prevQRef.current = null; // kualitas yang dipilih berhasil diputar
      if (timer) clearTimeout(timer);
      setLoading(false);
    };
    ["playing", "loadeddata", "canplay"].forEach((ev) => video.addEventListener(ev, onReady));
    // Suara jalan tapi gambar tidak ada (mis. codec HEVC tak didukung) -> coba varian lain.
    let noVideoTimer: ReturnType<typeof setTimeout> | null = null;
    const onPlayingCheck = () => {
      log("event playing");
      if (noVideoTimer) clearTimeout(noVideoTimer);
      noVideoTimer = setTimeout(() => {
        if (cancelled || audioModeRef.current || video.paused || giveUpVideoRef.current) return;
        if (video.videoWidth === 0) {
          if (variant + 1 < candidates.length) {
            console.warn(`Player: tanpa gambar di varian ${variant + 1}/${candidates.length}, mencoba varian berikutnya`);
            setVariant(variant + 1);
            setUseProxy(false);
          } else {
            // Semua varian tanpa gambar: kemungkinan live khusus audio. Berhenti berpindah (agar audio tidak putus-putus).
            console.warn("Player: semua varian tanpa gambar, memutar sebagai audio saja");
            giveUpVideoRef.current = true;
            setNoVideo(true);
            if (variant !== 0) {
              setVariant(0);
              setUseProxy(false);
            }
          }
        }
      }, 8000); // beri waktu: pada FLV, info video kadang tiba lebih lambat dari audio
    };
    video.addEventListener("playing", onPlayingCheck);
    const onWaiting = () => (statsRef.current.waiting += 1);
    const onStalled = () => (statsRef.current.stalled += 1);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("stalled", onStalled);
    const onDims = () => setDims(video.videoWidth ? `${video.videoWidth}×${video.videoHeight}` : null);
    ["loadedmetadata", "resize"].forEach((ev) => video.addEventListener(ev, onDims));

    // Autoplay dengan suara sering diblokir browser -> ulangi tanpa suara, atau minta klik.
    const tryPlay = async () => {
      try {
        await video.play();
      } catch {
        if (cancelled) return;
        video.muted = true;
        try {
          await video.play();
          if (!cancelled) setAutoMuted(true);
        } catch {
          if (!cancelled) setNeedsTap(true);
        }
      }
    };

    const start = async () => {
      // Cek cepat status sumber: 404/403/410 = live berakhir atau URL kedaluwarsa.
      // Jalan paralel dengan pemuatan video (tidak menahan awal putar). Hanya untuk mendeteksi live berakhir / URL kedaluwarsa.
      if (!isFlv(src)) {
        const ctrl = new AbortController();
        fetch(src, { signal: ctrl.signal, cache: "no-store" })
          .then((res) => {
            ctrl.abort();
            if (cancelled) return;
            log(`preflight HTTP ${res.status}`);
            if ([403, 404, 410].includes(res.status)) {
              fail(
                `TikTok membalas HTTP ${res.status}. Live kemungkinan sudah berakhir atau URL kedaluwarsa. Buka live-nya lagi lalu klik bookmarklet.`,
                true,
              );
            }
          })
          .catch((e) => {
            if (cancelled) return;
            log(`preflight gagal: ${String((e as Error)?.message ?? e).slice(0, 80)}`);
            if (!useProxy) fail(""); // CORS/jaringan -> proxy
          });
      }

      timer = setTimeout(() => fail("Tidak ada data video setelah 12 detik. Coba kualitas lain atau ambil ulang URL.", useProxy), 12000);

      if (isFlv(src)) {
        // FLV (umum dipakai live TikTok, sering berisi HEVC/H.265) -> mpegts.js (flv.js hanya mendukung H.264)
        try {
          const { default: mpegts } = await import("mpegts.js");
          if (cancelled) return;
          // Kegagalan FLV (mis. HEVC) sudah ditangani lewat event ERROR + pindah ke HLS; jangan biarkan pustaka menulis console.error
          // (di mode dev, Next.js menampilkannya sebagai layar "Console Error" seolah aplikasi rusak).
          mpegts.LoggingControl.applyConfig({ enableError: false, enableWarn: false, enableInfo: false, enableDebug: false, enableVerbose: false });
          if (!mpegts.getFeatureList().mseLivePlayback) return fail("Browser tidak mendukung pemutaran FLV live.", true);
          const player = mpegts.createPlayer(
            { type: "flv", isLive: true, url: src },
            {
              // Stash buffer dimatikan di semua mode: ini sumber tunda terbesar FLV (data menunggu terkumpul dulu sebelum diputar).
              // Mengejar tepi live dilakukan oleh pengatur kecepatan di komponen ini (bukan pustaka), agar tidak berebut playbackRate dengan ekstensi speed.
              enableStashBuffer: false,
              autoCleanupSourceBuffer: true,
              autoCleanupMaxBackwardDuration: 30,
              autoCleanupMinBackwardDuration: 15,
            },
          );
          player.attachMediaElement(video);
          let reconnects = 0;
          video.addEventListener("playing", () => (reconnects = 0)); // pulih: hitung ulang dari nol
          player.on(mpegts.Events.ERROR, (type: string, detail: string, info: unknown) => {
            log(`FLV error ${type}/${detail} ${JSON.stringify(info ?? {}).slice(0, 160)}`);
            const reason = `FLV error: ${type} / ${detail}`;
            // Koneksi putus/lambat: sambung ulang di tempat (gambar terakhir tetap tampil), jangan bongkar pemutar.
            if (type === mpegts.ErrorTypes.NETWORK_ERROR && reconnects < 6 && !cancelled) {
              reconnects++;
              log(`FLV putus, sambung ulang ${reconnects}/6`);
              setTimeout(() => {
                if (cancelled) return;
                try {
                  player.unload();
                  player.load();
                  void video.play().catch(() => {});
                } catch {
                  fail(reason);
                }
              }, 1000 * reconnects);
              return;
            }
            // Codec/format tidak didukung (mis. FLV berisi HEVC) bukan masalah jaringan: lewati proxy.
            if (/CodecUnsupported|Unsupported codec|FormatError|HEVC|Invalid .*Record/i.test(`${detail} ${JSON.stringify(info ?? {})}`)) {
              log("FLV tak terbaca (codec/format) -> utamakan HLS");
              if (!flvBad && hasHls) {
                setFlvBadIds((a) => (selId ? [...a, selId] : a));
                setVariant(0);
                setUseProxy(false);
                return;
              }
              return nextVariant(`Codec video tidak didukung browser ini (${detail}).`);
            }
            fail(reason);
          });
          player.on(mpegts.Events.MEDIA_INFO, (info: Record<string, unknown>) => {
            const { metadata: _m, ...rest } = info as {
              metadata?: unknown;
            } & Record<string, unknown>; // eslint-disable-line @typescript-eslint/no-unused-vars
            mediaInfoRef.current = { kind: "flv", ...rest };
            log(`FLV media info: video=${String(rest.videoCodec)} audio=${String(rest.audioCodec)} ${String(rest.width)}x${String(rest.height)}`);
          });
          player.load();
          void tryPlay();
          destroy = () => {
            try {
              player.unload();
              player.detachMediaElement();
              player.destroy();
            } catch {
              /* sudah dibersihkan */
            }
          };
        } catch (e) {
          log(`gagal memuat pemutar FLV: ${String((e as Error)?.message ?? e).slice(0, 80)}`);
          fail("Gagal memuat pemutar FLV.", true);
        }
      } else if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: lowLatency,
          liveSyncDurationCount: lowLatency ? 2 : 3,
          liveMaxLatencyDurationCount: lowLatency ? 5 : 12,
          maxLiveSyncPlaybackRate: 1, // playbackRate hanya diatur oleh pengatur kecepatan komponen (lihat di bawah)
          maxBufferLength: lowLatency ? 8 : 30,
          maxMaxBufferLength: 40,
          backBufferLength: 15,
          maxBufferHole: 0.5, // lompati celah kecil di buffer alih-alih berhenti
          nudgeMaxRetry: 10,
          startFragPrefetch: true,
          // Jaringan sesaat bermasalah: coba lagi lebih sabar sebelum dianggap putus.
          manifestLoadingMaxRetry: 6,
          levelLoadingMaxRetry: 6,
          fragLoadingMaxRetry: 6,
          fragLoadingRetryDelay: 500,
          manifestLoadingTimeOut: 8000,
          fragLoadingTimeOut: 12000,
        });
        let hlsRetries = 0;
        video.addEventListener("playing", () => (hlsRetries = 0));
        hlsRef.current = hls;
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
          setHlsLevels(data.levels.map((l, i) => ({ i, h: l.height || 0, kbps: Math.round(l.bitrate / 1000) })));
          mediaInfoRef.current = {
            ...mediaInfoRef.current,
            kind: "hls",
            levels: data.levels.map((l) => ({
              w: l.width,
              h: l.height,
              kbps: Math.round(l.bitrate / 1000),
              v: l.videoCodec,
              a: l.audioCodec,
            })),
          };
          void tryPlay();
        });
        hls.on(Hls.Events.BUFFER_CODECS, (_e, d) => {
          mediaInfoRef.current = {
            ...mediaInfoRef.current,
            bufferCodecs: {
              video: d.video ? d.video.codec : "TIDAK ADA",
              audio: d.audio ? d.audio.codec : "TIDAK ADA",
            },
          };
        });
        hls.on(Hls.Events.ERROR, (_e, data) => {
          console.warn("HLS error:", data.type, data.details);
          if (!data.fatal) return;
          // Pulihkan di tempat dulu (buffer yang sudah diproses tetap dipakai); baru menyerah bila berulang.
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR && hlsRetries < 6) {
            hlsRetries++;
            log(`HLS jaringan bermasalah, muat ulang ${hlsRetries}/6`);
            setTimeout(() => !cancelled && hls.startLoad(), 1000 * hlsRetries);
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && hlsRetries < 6) {
            hlsRetries++;
            log(`HLS media error, pulihkan ${hlsRetries}/6`);
            hls.recoverMediaError();
          } else fail(`HLS error: ${data.details}`);
        });
        destroy = () => {
          hls.destroy();
          if (hlsRef.current === hls) hlsRef.current = null;
        };
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = src;
        const onErr = () => fail("Video gagal dimuat.");
        video.addEventListener("error", onErr);
        void tryPlay();
        destroy = () => video.removeEventListener("error", onErr);
      } else {
        fail("Browser tidak mendukung HLS.", true);
      }
    };
    void start();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      ["playing", "loadeddata", "canplay"].forEach((ev) => video.removeEventListener(ev, onReady));
      ["loadedmetadata", "resize"].forEach((ev) => video.removeEventListener(ev, onDims));
      video.removeEventListener("playing", onPlayingCheck);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("stalled", onStalled);
      if (noVideoTimer) clearTimeout(noVideoTimer);
      if (slowTimer) clearTimeout(slowTimer);
      setSwitchSlow(false);
      // Pemutar yang sudah menjadi aktif dibiarkan hidup sampai penggantinya siap (dibongkar oleh onReady berikutnya / ended / unmount).
      if (!swapped) destroy?.();
    };
  }, [src, useProxy, variant, candidates.length, log, lowLatency, ended, restartKey, flvBad, hasHls, selId]);
  // Ganti kualitas: bingkai terakhir ditahan tanpa indikator apa pun (terasa seperti sekedip). Indikator memuat hanya muncul bila lama (> 2.5 dtk).
  useEffect(() => {
    if (!loading) {
      setSlowLoad(false);
      return;
    }
    setSlowLoad(true);
  }, [loading]);
  // Live berakhir: hentikan suara/gambar (pemutar sudah dibongkar oleh efek di atas).
  useEffect(() => {
    if (ended) {
      activeDestroyRef.current?.();
      activeDestroyRef.current = null;
      videoRef.current?.pause();
    }
  }, [ended]);
  useEffect(
    () => () => {
      activeDestroyRef.current?.();
      activeDestroyRef.current = null;
    },
    [],
  );

  const copyDiagnosis = async () => {
    const v = videoRef.current;
    const ms = typeof MediaSource !== "undefined" ? MediaSource : null;
    const sup = (t: string) => (ms ? ms.isTypeSupported(t) : "n/a");
    const ranges = v ? Array.from({ length: v.buffered.length }, (_, i) => `${v.buffered.start(i).toFixed(1)}-${v.buffered.end(i).toFixed(1)}`) : [];
    const q = v?.getVideoPlaybackQuality?.();
    const lines = [
      "=== DIAGNOSA TIKTOK PLAYER ===",
      `waktu: ${new Date().toISOString()}`,
      `browser: ${navigator.userAgent}`,
      `dukungan MSE: H264=${sup('video/mp4; codecs="avc1.64001f"')} HEVC=${sup('video/mp4; codecs="hvc1.1.6.L93.B0"')} AAC=${sup('audio/mp4; codecs="mp4a.40.2"')}`,
      `mode: ${mode} | kualitas: ${selected?.label} | tanpaGambar=${noVideo}`,
      `kualitas tersedia (${qualities.length}): ${qualities.map((q) => `${q.label}[${1 + (q.alts?.length ?? 0)} url]`).join(", ") || "-"}`,
      `varian: ${variant + 1}/${candidates.length} | via proxy: ${useProxy}`,
      ...candidates.map(
        (u, i) => `  ${i === variant ? ">" : " "} ${i + 1}. ${isFlv(u) ? "FLV" : "HLS"} ${new URL(u).host}/…/${u.split("?")[0].split("/").pop()}`,
      ),
      `video: ${v?.videoWidth}x${v?.videoHeight} | readyState=${v?.readyState} paused=${v?.paused} muted=${v?.muted} t=${v?.currentTime.toFixed(1)}`,
      `buffer: [${ranges.join(", ")}] | frame: total=${q?.totalVideoFrames} dropped=${q?.droppedVideoFrames}`,
      `waiting=${statsRef.current.waiting} stalled=${statsRef.current.stalled}`,
      `error: ${statsRef.current.errors.join(" | ") || "-"}`,
      `info media: ${JSON.stringify(mediaInfoRef.current)}`,
      "riwayat:",
      ...logRef.current.map((l) => `  ${l}`),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Salin laporan ini:", lines.join("\n"));
    }
  };

  useEffect(() => {
    if (!rec) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [rec]);
  // Hentikan rekaman bila komponen ditutup.
  useEffect(
    () => () => {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    },
    [],
  );

  const stopRecording = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  const startRecording = async () => {
    const v = videoRef.current;
    const kind: "video" | "audio" = mode === "audio" ? "audio" : "video";
    setRecMsg(null);
    if (!v || recorderRef.current?.state === "recording") return;
    const cap = (v as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.();
    if (!cap || typeof MediaRecorder === "undefined") return setRecMsg("Browser ini tidak mendukung perekaman.");
    // Suara mati karena autoplay (bukan pilihan pengguna): klik "Rekam" adalah interaksi pengguna, jadi boleh dinyalakan agar suara ikut terekam.
    if (v.muted && autoMuted) {
      v.muted = false;
      setAutoMuted(false);
    }
    if (v.muted)
      return setRecMsg(
        "Suara video sedang mati, hasil rekaman akan tanpa suara. Nyalakan suara dulu (klik 'Suara mati' di pemutar), lalu rekam lagi.",
      );
    const tracks = kind === "audio" ? cap.getAudioTracks() : cap.getTracks();
    if (!tracks.length) return setRecMsg("Belum ada data untuk direkam. Tunggu sampai video tampil.");

    const wanted =
      kind === "audio"
        ? ["audio/mp4;codecs=mp4a.40.2", "audio/webm;codecs=opus", "audio/webm"]
        : // avc1.640033 = High L5.1: perlu untuk video besar (mis. 1440x2560); level 4.0 gagal mengodekan ukuran sebesar itu.
          ["video/mp4;codecs=avc1.640033,mp4a.40.2", "video/mp4;codecs=avc1.640028,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    const mime = wanted.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    const isMp4 = mime.startsWith("video/mp4") || mime.startsWith("audio/mp4");
    const ext = kind === "audio" ? (isMp4 ? "m4a" : "webm") : isMp4 ? "mp4" : "webm";
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `tiktok_${username ?? "live"}_${stamp}_${kind}.${ext}`;

    // Mode "disk" (Chrome/Edge): tulis langsung ke disk, aman untuk rekaman panjang. Mode "download" (bawaan): simpan di memori
    // (dibatasi 500 MB) lalu diunduh. Dialog simpan harus dipanggil langsung dari klik pengguna, sebelum await lain.
    let writable: FileSystemWritableFileStream | null = null;
    const picker = (
      window as unknown as {
        showSaveFilePicker?: (o: unknown) => Promise<FileSystemFileHandle>;
      }
    ).showSaveFilePicker;
    if (picker && recMode === "disk") {
      try {
        const handle = await picker({
          suggestedName: filename,
          types: [
            {
              description: kind === "audio" ? "Audio" : "Video",
              accept: { [mime.split(";")[0] || `${kind}/webm`]: [`.${ext}`] },
            },
          ],
        });
        writable = await handle.createWritable();
      } catch (e) {
        if ((e as Error).name === "AbortError") return setRecMsg("Dialog simpan dibatalkan, rekaman tidak dimulai. Pilih lokasi simpan, atau ganti ke 'Unduh di akhir' di menu pengaturan.");
        writable = null; // izin ditolak / tidak didukung: lanjut dengan unduhan biasa
      }
    }

    // Bitrate mengikuti ukuran gambar: ~4 Mbps untuk 720p, sampai 12 Mbps untuk 1440p.
    const px = (v.videoWidth || 720) * (v.videoHeight || 1280);
    let mr: MediaRecorder;
    try {
      mr = new MediaRecorder(new MediaStream(tracks), {
        ...(mime ? { mimeType: mime } : {}),
        videoBitsPerSecond: Math.round(Math.min(12_000_000, Math.max(2_500_000, px * 4.3))),
        audioBitsPerSecond: 128_000,
      });
    } catch (err) {
      try {
        await writable?.abort();
      } catch {
        /* abaikan */
      }
      return setRecMsg(`Perekam tidak bisa dibuat (${(err as Error).message}). Coba turunkan kualitas video lalu rekam lagi.`);
    }
    const chunks: Blob[] = [];
    let chain: Promise<unknown> = Promise.resolve();
    recBytesRef.current = 0;
    mr.ondataavailable = (e) => {
      if (!e.data.size) return;
      recBytesRef.current += e.data.size;
      if (writable) {
        const w = writable;
        chain = chain.then(() => w.write(e.data));
      } else {
        chunks.push(e.data);
        if (recBytesRef.current > MEMORY_LIMIT && mr.state === "recording") {
          setRecMsg("Rekaman dihentikan otomatis karena mencapai 500 MB (browser ini tidak bisa menulis langsung ke disk).");
          mr.stop();
        }
      }
    };
    mr.onstop = async () => {
      try {
        if (writable) {
          await chain;
          await writable.close();
          setRecMsg(`Tersimpan: ${filename} (${fmtBytes(recBytesRef.current)})`);
        } else if (chunks.length) {
          const url = URL.createObjectURL(new Blob(chunks, { type: mr.mimeType || mime }));
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          a.style.display = "none";
          document.body.appendChild(a); // lebih kompatibel di berbagai browser daripada anchor yang tidak terpasang
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 120_000); // beri waktu browser mengambil file besar sebelum alamatnya dicabut
          setRecMsg(`Diunduh: ${filename} (${fmtBytes(recBytesRef.current)}). Bila browser menolak, cek ikon unduhan, atau pakai mode 'Langsung ke disk'.`);
        } else setRecMsg("Tidak ada data yang terekam.");
      } catch (err) {
        setRecMsg(`Gagal menyimpan rekaman: ${(err as Error).message}`);
      } finally {
        recorderRef.current = null;
        setRec(null);
      }
    };
    mr.onerror = (ev) => {
      const detail = (ev as unknown as { error?: { message?: string } }).error?.message;
      setRecMsg(`Perekaman terhenti karena error${detail ? `: ${detail}` : ""}. Bila video sangat besar, turunkan kualitas (mis. 720p) lalu coba lagi.`);
    };
    recorderRef.current = mr;
    try {
      mr.start(1000);
    } catch (err) {
      recorderRef.current = null;
      try {
        await writable?.abort();
      } catch {
        /* abaikan */
      }
      return setRecMsg(`Perekaman gagal dimulai: ${(err as Error).message}`);
    }
    setNow(Date.now());
    setRec({ kind, startedAt: Date.now(), toDisk: !!writable });
  };

  const tapToPlay = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    setNeedsTap(false);
    setAutoMuted(false);
    void v.play().catch(() => setNeedsTap(true));
  };
  const unmute = () => {
    if (videoRef.current) videoRef.current.muted = false;
    setAutoMuted(false);
  };

  useEffect(() => {
    setCanPip(typeof document !== "undefined" && document.pictureInPictureEnabled === true);
    const onFs = () => setIsFs(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // Menu pengaturan: tutup saat klik di luar atau tekan Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);
  const openMenu = () => {
    setMenuView("main");
    setMenuOpen((o) => !o);
  };

  // Sinkronkan status putar/volume dari elemen media (dipakai kontrol di tampilan audio, saat elemen video disembunyikan).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const sync = () => {
      setPlaying(!v.paused);
      setVol(v.volume);
      setIsMuted(v.muted);
    };
    const events = ["play", "pause", "playing", "volumechange"];
    events.forEach((ev) => v.addEventListener(ev, sync));
    sync();
    return () => events.forEach((ev) => v.removeEventListener(ev, sync));
  }, [failed, slot]);
  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => setNeedsTap(true));
    else v.pause();
  };
  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    if (!v.muted && v.volume === 0) v.volume = 0.8;
    setAutoMuted(false);
  };
  const changeVolume = (x: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = x;
    v.muted = x === 0;
    if (x > 0) setAutoMuted(false);
  };

  // Auto: bila tersendat >= 6 kali dalam 30 detik (dan sudah memutar > 15 dtk, agar "waiting" saat awal putar tidak dihitung), turun satu tingkat kualitas.
  useEffect(() => {
    if (!isAuto || mode === "audio") return;
    const t = setInterval(() => {
      const n = statsRef.current.waiting + statsRef.current.stalled;
      const base = autoBaseRef.current;
      if (n < base.n) {
        autoBaseRef.current = { n, t: Date.now() }; // statistik di-reset saat pemutar dimulai ulang
        return;
      }
      if (userRateRef.current > 1.01) autoBaseRef.current = { n, t: Date.now() }; // macet akibat user mempercepat bukan salah kualitas
      else if (Date.now() - base.t > 30000) autoBaseRef.current = { n, t: Date.now() };
      else if (n - base.n >= 6 && autoIdx < qOptions.length - 1 && (videoRef.current?.currentTime ?? 0) > 15) {
        log(`Auto: tersendat ${n - base.n}x, turun ke kualitas lebih rendah`);
        autoBaseRef.current = { n, t: Date.now() };
        setAutoIdx(autoIdx + 1);
      }
    }, 5000);
    return () => clearInterval(t);
  }, [isAuto, mode, autoIdx, qOptions.length, log]);

  // Pengatur kecepatan putar (satu-satunya pemilik playbackRate). Menangani dua hal:
  // 1) Pengguna mempercepat lewat ekstensi (Video Speed Controller dll). Pada siaran live data hanya datang 1 dtk per 1 dtk, jadi
  //    kecepatan > 1x menguras buffer lalu macet. Solusi: cepat saat buffer cukup, melambat sebentar (isi ulang buffer) saat tipis,
  //    sehingga rata-rata lebih cepat dari 1x tanpa freeze.
  // 2) Kecepatan 1x: bila tertinggal dari tepi live, putar sedikit lebih cepat sampai dekat (tanpa loncat).
  useEffect(() => {
    const ours = new WeakMap<HTMLVideoElement, number>();
    const set = (v: HTMLVideoElement, r: number) => {
      if (Math.abs(v.playbackRate - r) < 0.001) return;
      ours.set(v, r);
      v.playbackRate = r;
    };
    const onRate = (e: Event) => {
      const v = e.target as HTMLVideoElement;
      const mine = ours.get(v);
      if (mine !== undefined && Math.abs(v.playbackRate - mine) < 0.001) return; // perubahan dari kita sendiri
      userRateRef.current = v.playbackRate; // dari pengguna/ekstensi
    };
    const els = [vidA.current, vidB.current].filter(Boolean) as HTMLVideoElement[];
    els.forEach((v) => v.addEventListener("ratechange", onRate));
    let slow = false;
    let catching = false;
    const t = setInterval(() => {
      const v = videoRef.current;
      if (!v || v.paused || !v.buffered.length || v.seeking) return;
      const l = Math.max(0, v.buffered.end(v.buffered.length - 1) - v.currentTime);
      const want = userRateRef.current;
      if (want > 1.01) {
        if (!slow && l < 0.4) slow = true;
        else if (slow && l > 1.3) slow = false;
        set(v, slow ? 0.75 : want);
        catching = false;
        return;
      }
      slow = false;
      const hi = lowLatency ? 1.5 : 2.5;
      const lo = lowLatency ? 0.8 : 1.5;
      if (!catching && l > hi) catching = true;
      else if (catching && l < lo) catching = false;
      set(v, catching ? (lowLatency ? 1.12 : 1.06) : want);
    }, 250);
    return () => {
      clearInterval(t);
      els.forEach((v) => v.removeEventListener("ratechange", onRate));
    };
  }, [lowLatency]);

  // Ukur jeda buffer tiap detik, sekaligus mengejar tepi live otomatis (berlaku untuk FLV maupun HLS):
  // jeda sedang -> putar sedikit lebih cepat; jeda besar -> loncat sekali ke dekat tepi (sisakan bantalan agar tidak loading).
  useEffect(() => {
    let lastT = -1;
    let stuck = 0;
    const t = setInterval(() => {
      const v = videoRef.current;
      if (!v || v.paused || !v.buffered.length) {
        stuck = 0;
        return setLag(null);
      }
      const end = v.buffered.end(v.buffered.length - 1);
      const l = Math.max(0, end - v.currentTime);
      setLag(l);
      if (v.seeking) return;
      // Penjaga macet: gambar tidak maju padahal tidak dijeda (data tetap masuk, jeda membengkak). Dorong ke dalam buffer; bila tetap macet, mulai ulang pemutar.
      if (Math.abs(v.currentTime - lastT) < 0.05) stuck++;
      else stuck = 0;
      lastT = v.currentTime;
      if (stuck === 3 && l > 0.6) {
        v.currentTime = Math.max(v.currentTime + 0.1, end - Math.min(1.5, l / 2));
        void v.play().catch(() => {});
      } else if (stuck >= 8) {
        stuck = 0;
        setRestartKey((k) => k + 1);
        return;
      }
      if (!lowLatency) {
        // Mode normal: jangan ganggu putaran; loncat hanya bila sudah sangat tertinggal (tidak lagi percepatan).
        if (l > 25) v.currentTime = end - 8;
        return;
      }
      if (l > 5) v.currentTime = end - 2;
    }, 1000);
    return () => clearInterval(t);
  }, [lowLatency]);
  const goLive = () => {
    const v = videoRef.current;
    if (!v || !v.buffered.length) return;
    const end = v.buffered.end(v.buffered.length - 1);
    // Sisakan bantalan ~1.5 dtk di depan posisi putar; kalau mepet ke ujung buffer, video pasti berhenti menunggu data (loading).
    const hlsPos = hlsRef.current?.liveSyncPosition;
    const target = typeof hlsPos === "number" && hlsPos <= end - 1 ? hlsPos : end - 1.5;
    if (target > v.currentTime + 0.5) v.currentTime = target;
  };
  const toggleLowLatency = () => {
    const next = !lowLatency;
    setLowLatency(next);
    try {
      localStorage.setItem("tt-lowlat", next ? "1" : "0");
    } catch {
      /* abaikan */
    }
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stageRef.current?.requestFullscreen?.();
  };
  const togglePip = async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await v.requestPictureInPicture();
    } catch (e) {
      console.warn("PiP:", e);
    }
  };

  const changeMode = (m: Mode) => {
    giveUpVideoRef.current = false;
    setNoVideo(false);
    setMode(m);
    setVariant(0);
    setUseProxy(false);
  };
  const pickLevel = (i: number) => {
    const h = hlsRef.current;
    if (!h) return;
    h.currentLevel = i; // pindah tingkat di dalam pemutar yang sama (tanpa memuat ulang kartu)
    setLevelSel(i);
  };
  const showQualityHint = () => {
    setRecMsg("Live ini hanya memberi satu pilihan kualitas. Kalau seharusnya ada lebih, buka live-nya lagi lalu klik bookmark, atau mulai Track ulang.");
    setMenuOpen(false);
  };
  const chooseAuto = () => {
    giveUpVideoRef.current = false;
    setNoVideo(false);
    setIsAuto(true);
    setAutoIdx(autoStart);
    setVariant(0);
    setUseProxy(false);
  };
  const changeQuality = (id: string) => {
    if (id !== selected?.id || isAuto) {
      if (selected && !failed) prevQRef.current = { id: selected.id, auto: isAuto };
    }
    giveUpVideoRef.current = false;
    setNoVideo(false);
    setIsAuto(false);
    setVideoId(id);
    setVariant(0);
    setUseProxy(false);
  };

  const audioMode = mode === "audio";
  const noVideoUi = noVideo && !audioMode;
  const portrait = (() => {
    const m = /^(\d+)×(\d+)$/.exec(dims ?? "");
    return m ? Number(m[2]) > Number(m[1]) : false;
  })();
  // Rasio asli video (bila diketahui dan potret); dipakai agar panggung mobile pas dengan gambarnya, tanpa pita hitam.
  const vidRatio = (() => {
    const m = /^(\d+)×(\d+)$/.exec(dims ?? "");
    const r = m ? Number(m[1]) / Number(m[2]) : 9 / 16;
    return r < 1 ? Math.min(Math.max(r, 0.4), 0.75) : 9 / 16;
  })();
  // Rasio gambar video yang sebenarnya (apa pun orientasinya), untuk menaruh notifikasi tepat di atas gambar, bukan di pita hitam.
  const realRatio = (() => {
    const m = /^(\d+)×(\d+)$/.exec(dims ?? "");
    return m && Number(m[2]) > 0 ? Number(m[1]) / Number(m[2]) : 16 / 9;
  })();
  const effLayout: Layout = layoutUser ?? (portrait ? "mobile" : "wide"); // otomatis: mengikuti bentuk video (potret -> mobile)
  useEffect(() => {
    onLayoutChange?.(effLayout);
  }, [effLayout, onLayoutChange]);
  // Mode mobile: kartu sendiri menyempit seukuran layar ponsel (bukan hanya videonya), sisa ruang dipakai halaman (mis. untuk chat).
  const mobileCardStyle =
    effLayout === "mobile" && !isFs
      ? {
          width: plain ? `calc((100dvh - 6.5rem) * ${vidRatio})` : `max(22rem, calc((100dvh - 17rem) * ${vidRatio}))`,
          maxWidth: "100%",
          marginInline: "auto",
        }
      : undefined;
  const audioUI = audioMode || noVideoUi; // tampilan panel audio (dipilih pengguna, atau stream memang tanpa gambar)

  // Daftar pilihan kualitas di menu: (a) tingkat TikTok-style bila live memberi beberapa alamat, atau (b) tingkat di dalam satu daftar HLS.
  const levelMode = qOptions.length <= 1 && hlsLevels.length > 1;
  const sortedLevels = [...hlsLevels].sort((a, b) => b.h - a.h || b.kbps - a.kbps);
  const levelName = (l: { h: number; kbps: number }) => {
    const dup = hlsLevels.filter((x) => x.h === l.h).length > 1;
    return l.h ? (dup ? `${l.h}p · ${l.kbps} kbps` : `${l.h}p`) : `${l.kbps} kbps`;
  };
  const qItems: { key: string; name: string; active: boolean; pick: () => void }[] = levelMode
    ? [
        { key: "auto", name: "Auto", active: levelSel === -1, pick: () => pickLevel(-1) },
        ...sortedLevels.map((l) => ({ key: `lv${l.i}`, name: levelName(l), active: levelSel === l.i, pick: () => pickLevel(l.i) })),
      ]
    : [
        {
          key: "auto",
          name: `Auto (${qNames.get(qOptions[Math.min(isAuto ? autoIdx : autoStart, qOptions.length - 1)]?.id ?? "") ?? "Original"})`,
          active: isAuto,
          pick: chooseAuto,
        },
        ...qOptions.map((q) => ({ key: q.id, name: qNames.get(q.id) ?? q.label, active: !isAuto && q.id === selected?.id, pick: () => changeQuality(q.id) })),
      ];

  return (
    <div
      style={mobileCardStyle}
      className={
        plain ? "overflow-hidden rounded-xl bg-black" : "overflow-hidden rounded-2xl border border-line bg-surface shadow-xl backdrop-blur-md"
      }
    >
      {!plain && (
        <>
          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-3 py-2.5">
            <div role="tablist" aria-label="Mode pemutaran" className="flex gap-1 rounded-lg border border-line bg-black/20 p-1">
              {(
                [
                  { id: "video", label: "Video", icon: FaVideo },
                  { id: "audio", label: "Audio", icon: FaHeadphones },
                ] as const
              ).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  role="tab"
                  type="button"
                  aria-selected={mode === id}
                  onClick={() => changeMode(id)}
                  className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs transition ${
                    mode === id ? "bg-white/15 font-medium text-white" : "text-muted hover:text-white"
                  }`}
                >
                  <Icon aria-hidden className="h-3 w-3" />
                  {label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {rec ? (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold tabular-nums transition hover:bg-rose-500"
                >
                  <FaStop aria-hidden className="h-3 w-3" /> Berhenti · {fmtTime(now - rec.startedAt)} · {fmtBytes(recBytesRef.current)}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void startRecording().catch((err) => setRecMsg(`Perekaman gagal: ${(err as Error).message}`))}
                  disabled={loading || failed}
                  title={mode === "audio" ? "Rekam audio saja" : "Rekam video + audio"}
                  className="flex items-center gap-2 rounded-lg border border-line bg-white/5 px-3 py-2 text-xs transition hover:bg-white/10"
                >
                  <FaCircleDot aria-hidden className="h-3 w-3 text-accent" /> Rekam {mode === "audio" ? "audio" : "video"}
                </button>
              )}
            </div>
          </div>

          {(rec || recMsg) && (
            <div role="status" className="flex items-center justify-between gap-2 border-b border-line bg-black/20 px-3 py-2 text-xs">
              {rec ? (
                <span className="flex items-center gap-2 text-rose-300">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
                  Merekam {rec.kind === "audio" ? "audio" : "video + audio"} · {rec.toDisk ? "langsung ke disk" : "disimpan di memori, lalu diunduh"}
                </span>
              ) : (
                <span className="text-amber-200">{recMsg}</span>
              )}
              {!rec && (
                <button type="button" onClick={() => setRecMsg(null)} className="shrink-0 text-muted hover:text-white">
                  Tutup
                </button>
              )}
            </div>
          )}

          {/* Info teknis (tersembunyi secara default) */}
          {baseUrl && (
            <details className="group border-b border-line text-[11px] text-muted">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-1.5 hover:text-white">
                <span className="transition group-open:rotate-90">▸</span>
                Info teknis
              </summary>
              <div className="flex items-center justify-between gap-3 px-3 pb-2">
                <span className="truncate" title={baseUrl}>
                  Sumber: <span className="text-white/80">{baseUrl.split("?")[0].split("/").pop()}</span> · {isFlv(baseUrl) ? "FLV" : "HLS"} ·{" "}
                  {useProxy ? "via proxy" : "langsung"}
                  {candidates.length > 1 && ` · varian ${variant + 1}/${candidates.length}`}
                  {dims && ` · diputar ${dims}`}
                  {lag !== null && ` · jeda buffer ${lag.toFixed(1)} dtk`}
                  {lowLatency && " · latensi rendah"}
                </span>
                <button
                  type="button"
                  onClick={copyDiagnosis}
                  className="shrink-0 rounded-md border border-line bg-white/5 px-2 py-1 text-[11px] text-white transition hover:bg-white/10"
                >
                  {copied ? "Tersalin ✓" : "Salin diagnosa"}
                </button>
              </div>
            </details>
          )}
        </>
      )}

      {/* Stage */}
      {failed ? (
        <div className="flex aspect-video flex-col items-center justify-center gap-3 bg-black px-6 text-center">
          {/HTTP (403|404|410)/.test(failReason ?? "") ? (
            <>
              <FaVideoSlash aria-hidden className="h-7 w-7 text-white/70" />
              <p className="text-base font-semibold text-white">Live telah berakhir</p>
            </>
          ) : (
            <FaTriangleExclamation aria-hidden className="h-6 w-6 text-amber-300" />
          )}
          <p className="text-sm text-muted">
            {failReason ??
              "Tidak bisa diputar. URL mungkin sudah kedaluwarsa (live berakhir atau terlalu lama). Ambil ulang dengan bookmarklet, atau coba kualitas lain."}
          </p>
          {username && (
            <a
              href={`https://www.tiktok.com/@${username}/live`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold"
            >
              Buka live di TikTok <FaArrowUpRightFromSquare aria-hidden className="h-3 w-3" />
            </a>
          )}
        </div>
      ) : (
        <div
          ref={stageRef}
          onMouseMove={pokeControls}
          onTouchStart={pokeControls}
          onMouseLeave={() => playing && !menuOpen && setCtlVisible(false)}
          // Mobile: lebar mengikuti tinggi (maks 78vh) agar panggung pas dengan videonya, tanpa pita hitam di sisi.
          style={!isFs && effLayout === "mobile" ? { aspectRatio: String(vidRatio), width: "100%", maxWidth: `calc((100dvh - ${plain ? "6.5rem" : "17rem"}) * ${vidRatio})` } : undefined}
          className={`group relative bg-black ${isFs ? "h-screen w-screen" : effLayout === "mobile" ? "mx-auto" : "aspect-video"}`}
        >
          {/* Elemen video tetap ada di mode audio agar suara terus diputar */}
          {[vidA, vidB].map((r, i) => (
            <video
              key={i}
              ref={r}
              autoPlay
              playsInline
              onClick={audioUI || slot !== i ? undefined : togglePlay}
              className={
                audioUI
                  ? "sr-only"
                  : slot === i
                    ? "relative z-0 h-full w-full cursor-pointer bg-black object-contain"
                    : "pointer-events-none absolute inset-0 h-full w-full bg-black object-contain opacity-0"
              }
            />
          ))}
          {/* Kontrol bawah (menggantikan kontrol bawaan browser, tanpa menu titik tiga) */}
          {!audioUI && !needsTap && (
            <div
              className={`absolute inset-x-0 bottom-0 z-10 flex items-center gap-3 bg-gradient-to-t from-black/75 to-transparent px-4 pb-3 pt-10 transition-opacity duration-200 ${
                ctlVisible || !playing || menuOpen ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
            >
              <button
                type="button"
                onClick={togglePlay}
                aria-label={playing ? "Jeda" : "Putar"}
                title={playing ? "Jeda" : "Putar"}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/30"
              >
                {playing ? <FaPause aria-hidden className="h-4 w-4" /> : <FaPlay aria-hidden className="h-4 w-4 translate-x-px" />}
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleMute}
                  aria-label={isMuted || vol === 0 ? "Nyalakan suara" : "Matikan suara"}
                  title={isMuted || vol === 0 ? "Nyalakan suara" : "Matikan suara"}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-white transition hover:bg-white/20"
                >
                  {isMuted || vol === 0 ? <FaVolumeXmark aria-hidden className="h-[18px] w-[18px]" /> : <FaVolumeHigh aria-hidden className="h-[18px] w-[18px]" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : vol}
                  onChange={(e) => changeVolume(Number(e.target.value))}
                  aria-label="Volume"
                  className="h-1.5 w-20 cursor-pointer accent-[#25f4ee] sm:w-28"
                />
              </div>
              <button
                type="button"
                onClick={goLive}
                aria-label="Ke tepi live"
                title="Ke tepi live"
                className="ml-auto flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-bold tracking-wide text-white transition hover:brightness-110"
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> LIVE
              </button>
            </div>
          )}
          {plain && onClose && (
            <div
              className={`absolute left-4 top-4 z-20 flex items-center gap-2 transition-opacity duration-200 ${
                audioUI || ctlVisible || !playing || menuOpen ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
            >
              <button
                type="button"
                onClick={onClose}
                title="Tutup live"
                className="flex items-center gap-2 rounded-full bg-rose-600/90 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-rose-500"
              >
                <FaStop aria-hidden className="h-3 w-3" /> Tutup
              </button>
              {username && <span className="rounded-full bg-black/55 px-3 py-2 text-sm font-medium text-white backdrop-blur">@{username}</span>}
            </div>
          )}
          {/* Pengaturan di dalam pemutar (gaya TikTok): menu utama + panel kualitas di sampingnya */}
          <div
            ref={menuRef}
            className={`absolute right-4 top-4 z-20 flex flex-col items-end gap-2.5 transition-opacity duration-200 ${
              audioUI || ctlVisible || !playing || menuOpen ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            <div className="flex gap-3">
              <button
                type="button"
                onClick={openMenu}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Pengaturan video"
                title="Pengaturan"
                className={`flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition hover:bg-black/75 ${menuOpen ? "ring-2 ring-accent-2" : "opacity-80 hover:opacity-100"}`}
              >
                <FaGear aria-hidden className={`h-[18px] w-[18px] transition ${menuOpen ? "rotate-45" : ""}`} />
              </button>
              <button
                type="button"
                onClick={toggleFullscreen}
                aria-label={isFs ? "Keluar layar penuh" : "Layar penuh"}
                title={isFs ? "Keluar layar penuh" : "Layar penuh"}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white opacity-80 backdrop-blur transition hover:bg-black/75 hover:opacity-100"
              >
                {isFs ? <FaCompress aria-hidden className="h-[18px] w-[18px]" /> : <FaExpand aria-hidden className="h-[18px] w-[18px]" />}
              </button>
            </div>

            {menuOpen && (
              <div className="relative">
                <div
                  role="menu"
                  aria-label="Pengaturan video"
                  className={`w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-[#262626]/95 p-2 text-[15px] text-white shadow-2xl backdrop-blur-xl ${
                    effLayout === "mobile" && menuView === "quality" ? "hidden" : ""
                  }`}
                >
                  <MenuRow
                    icon={FaRotate}
                    label="Orientasi"
                    value={effLayout === "wide" ? "Lebar" : "Mobile"}
                    onClick={() => {
                      setLayoutUser(effLayout === "wide" ? "mobile" : "wide");
                      setMenuOpen(false);
                    }}
                  />
                  {!audioMode &&
                    (qOptions.length > 1 || levelMode ? (
                      <MenuRow
                        icon={FaSliders}
                        label="Kualitas"
                        value={
                          levelMode
                            ? (qItems.find((it) => it.active)?.name ?? "Auto")
                            : isAuto
                              ? `Auto (${qNames.get(selected?.id ?? "") ?? "Original"})`
                              : (qNames.get(selected?.id ?? "") ?? "Original")
                        }
                        chevron
                        active={menuView === "quality"}
                        onClick={() => setMenuView((v) => (v === "quality" ? "main" : "quality"))}
                      />
                    ) : (
                      // Live hanya memberi satu kualitas (data dari TikTok/bookmark): tetap ditampilkan agar jelas, bukan hilang karena galat.
                      <MenuRow
                        icon={FaSliders}
                        label="Kualitas"
                        value={`${qNames.get(selected?.id ?? "") ?? "Original"} · hanya 1 pilihan`}
                        onClick={() => showQualityHint()}
                      />
                    ))}
                  {audioMode && (
                    <MenuRow
                      icon={FaVideo}
                      label="Tampilkan video"
                      onClick={() => {
                        changeMode("video");
                        setMenuOpen(false);
                      }}
                    />
                  )}
                  {plain && !audioMode && (
                    <MenuRow
                      icon={FaHeadphones}
                      label="Audio saja"
                      onClick={() => {
                        changeMode("audio");
                        setMenuOpen(false);
                      }}
                    />
                  )}
                  {gifts && (
                    <MenuRow
                      icon={FaGift}
                      label="Gift di layar"
                      value={giftOverlay ? "Aktif" : "Mati"}
                      valueAccent={giftOverlay}
                      onClick={() => {
                        toggleGiftOverlay();
                        setMenuOpen(false);
                      }}
                    />
                  )}
                  {gifts && giftOverlay && (
                    <MenuRow
                      icon={FaGift}
                      label="Contoh efek gift besar"
                      onClick={() => {
                        // Contoh: pakai gift/pengirim terakhir yang benar-benar masuk bila ada; kalau belum ada, gambar mawar.
                        const last = [...(gifts ?? [])].reverse().find((g) => g.icon) ?? gifts?.at(-1);
                        enqueueBig({
                          id: Date.now(),
                          user: last?.user ?? username ?? "penonton",
                          avatar: last?.avatar,
                          level: last?.level ?? 42,
                          gift: last?.gift ?? "Contoh gift besar",
                          icon: last?.icon ?? "https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/eba3a9bb85c33e017f3648eaf88d7189~tplv-obj.png",
                          count: 1,
                          coins: 29999,
                        });
                        setMenuOpen(false);
                      }}
                    />
                  )}
                  {!plain && (
                    <MenuRow
                      icon={FaFloppyDisk}
                      label="Simpan rekaman"
                      value={recMode === "disk" ? "Langsung ke disk" : "Unduh di akhir"}
                      valueAccent={recMode === "disk"}
                      onClick={() => {
                        toggleRecMode();
                        setMenuOpen(false);
                      }}
                    />
                  )}
                  <MenuRow
                    icon={FaBolt}
                    label="Latensi rendah"
                    value={lowLatency ? "Aktif" : "Mati"}
                    valueAccent={lowLatency}
                    onClick={() => {
                      toggleLowLatency();
                      setMenuOpen(false);
                    }}
                  />
                  {lag !== null && lag > 2.5 && (
                    <MenuRow
                      icon={FaForwardFast}
                      label="Ke live"
                      value={`tertinggal ±${Math.round(lag)} dtk`}
                      onClick={() => {
                        goLive();
                        setMenuOpen(false);
                      }}
                    />
                  )}
                  {canPip && !audioUI && (
                    <MenuRow
                      icon={FaWindowRestore}
                      label="Picture-in-picture"
                      onClick={() => {
                        void togglePip();
                        setMenuOpen(false);
                      }}
                    />
                  )}
                </div>

                {/* Panel kualitas: di samping menu pada layar lebar, menutupi menu utama pada layar sempit */}
                {menuView === "quality" && (
                  <div
                    role="radiogroup"
                    aria-label="Kualitas video"
                    // Kartu sempit (mode Mobile): panel menimpa menu utama, karena kartu memotong apa pun di luar tepinya.
                    // Kartu lebar: panel muncul di samping kiri menu (di layar kecil tetap menimpa).
                    className={`z-10 flex flex-col rounded-2xl border border-white/10 bg-[#262626] p-2 text-[15px] text-white shadow-2xl ${
                      effLayout === "mobile"
                        ? "relative w-72 max-w-[calc(100vw-2rem)]" // menu utama disembunyikan; panel setinggi isinya
                        : "absolute inset-0 sm:inset-auto sm:right-[calc(100%+0.5rem)] sm:top-0 sm:w-60 sm:bg-[#262626]/95 sm:backdrop-blur-xl"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setMenuView("main")}
                      className={`mb-1 flex w-full items-center gap-2 rounded-xl px-4 py-2.5 text-left text-sm text-white/70 transition hover:bg-white/10 ${effLayout === "mobile" ? "" : "sm:hidden"}`}
                    >
                      <FaChevronLeft aria-hidden className="h-3.5 w-3.5" /> Kualitas
                    </button>
                    {qItems.map((it) => (
                      <button
                        key={it.key}
                        type="button"
                        role="radio"
                        aria-checked={it.active}
                        onClick={() => {
                          it.pick();
                          setMenuOpen(false);
                        }}
                        className={`flex w-full items-center justify-between gap-3 rounded-xl px-5 py-3.5 text-left transition hover:bg-white/10 ${it.active ? "font-semibold" : "text-white/85"}`}
                      >
                        <span>{it.name}</span>
                        {it.active && <FaCheck aria-hidden className="h-4 w-4 text-white" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          {audioUI && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 overflow-hidden px-6 py-10 text-center">
              {thumbnail && <img src={thumbnail} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-20 blur-2xl" />}
              <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-line bg-white/10">
                {thumbnail ? (
                  <img src={thumbnail} alt="" className="h-full w-full rounded-full object-cover" />
                ) : (
                  <FaHeadphones aria-hidden className="h-8 w-8 text-muted" />
                )}
              </div>
              <div className="relative flex h-6 items-end gap-1" aria-hidden>
                {[0, 1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    className={`w-1 rounded-full bg-accent-2 ${loading ? "h-1 opacity-40" : "animate-pulse"}`}
                    style={
                      loading
                        ? undefined
                        : {
                            height: `${10 + ((i * 7) % 14)}px`,
                            animationDelay: `${i * 120}ms`,
                          }
                    }
                  />
                ))}
              </div>
              <p className="relative text-sm text-muted">
                {loading ? "Menyiapkan audio…" : `Mendengarkan${username ? ` @${username}` : ""}`}
                {noVideoUi && !loading && (
                  <span className="block text-xs opacity-70">
                    Stream ini tidak punya gambar (live khusus audio, atau codec video tidak didukung browser). Hanya suara.
                  </span>
                )}
                {audioMode && !audioQ && !loading && <span className="block text-xs opacity-70">Video disembunyikan, hanya suara.</span>}
              </p>

              {/* Kontrol audio sendiri (elemen video disembunyikan di tampilan ini) */}
              <div className="relative flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={togglePlay}
                  aria-label={playing ? "Jeda" : "Putar"}
                  title={playing ? "Jeda" : "Putar"}
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
                >
                  {playing ? <FaPause aria-hidden className="h-4 w-4" /> : <FaPlay aria-hidden className="h-4 w-4 translate-x-px" />}
                </button>
                <button
                  type="button"
                  onClick={toggleMute}
                  aria-label={isMuted || vol === 0 ? "Nyalakan suara" : "Matikan suara"}
                  title={isMuted || vol === 0 ? "Nyalakan suara" : "Matikan suara"}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
                >
                  {isMuted || vol === 0 ? <FaVolumeXmark aria-hidden className="h-4 w-4" /> : <FaVolumeHigh aria-hidden className="h-4 w-4" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : vol}
                  onChange={(e) => changeVolume(Number(e.target.value))}
                  aria-label="Volume"
                  className="h-1.5 w-32 cursor-pointer accent-[#25f4ee]"
                />
                {plain && audioMode && (
                  <button
                    type="button"
                    onClick={() => changeMode("video")}
                    className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/20"
                  >
                    <FaVideo aria-hidden className="h-3 w-3" /> Tampilkan video
                  </button>
                )}
              </div>
            </div>
          )}
          {giftOverlay && (giftPopups.length > 0 || bigGift || activeGoals.length > 0) && (
            // Area notifikasi mengikuti posisi asli gambar video (object-contain), bukan seluruh panggung.
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center" style={{ containerType: "size" }}>
              <div
                aria-live="polite"
                className="relative"
                style={
                  audioUI
                    ? { width: "100%", height: "100%", containerType: "inline-size" }
                    : { aspectRatio: String(realRatio), width: `min(100cqw, calc(100cqh * ${realRatio}))`, containerType: "inline-size" }
                }
              >
                {activeGoals.length > 0 && (
                  <div className="absolute left-2 top-2 flex max-w-[70%] flex-col gap-1.5">
                    {activeGoals.map((g) => {
                      const pct = Math.min(100, Math.round((g.current / g.target) * 100));
                      const done = g.current >= g.target;
                      return (
                        <div key={g.giftId} className="flex items-center gap-1.5 rounded-xl bg-black/55 px-1.5 py-1 text-white shadow backdrop-blur-sm">
                          <GiftThumb src={g.icon} size="clamp(16px, 5cqw, 22px)" />
                          <span className="min-w-0 flex-1 leading-tight">
                            <span className="flex items-center justify-between gap-2 font-semibold" style={{ fontSize: "clamp(8px, 3cqw, 11px)" }}>
                              <span className="truncate">{g.name ?? `Gift #${g.giftId}`}</span>
                              <span className={`shrink-0 tabular-nums ${done ? "text-emerald-300" : "text-amber-200"}`}>
                                {g.current}/{g.target}
                              </span>
                            </span>
                            <span className="mt-0.5 flex items-center gap-1.5">
                              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/20">
                                <span className={`block h-full rounded-full transition-all ${done ? "bg-emerald-400" : "bg-amber-400"}`} style={{ width: `${pct}%` }} />
                              </span>
                              <span className="shrink-0 tabular-nums text-white/70" style={{ fontSize: "clamp(7px, 2.6cqw, 10px)" }}>
                                {done ? "Tercapai" : g.expiresAt ? mmss(g.expiresAt - nowMs) : ""}
                              </span>
                            </span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {bigGift && (
                  <div
                    key={bigGift.id}
                    className="gift-big absolute inset-0 flex flex-col items-center justify-center overflow-hidden"
                    style={{ ["--gift-big-dur" as string]: (bigGift.coins ?? 0) >= 10000 ? "7s" : "4.5s" }}
                  >
                    <div className="gift-big-glow absolute inset-0" />
                    <div className="gift-big-rays absolute left-1/2 top-1/2" style={{ width: "150cqw", height: "150cqw" }} />
                    {[8, 22, 36, 50, 64, 78, 90].map((x, i) => (
                      <span
                        key={x}
                        className="gift-big-spark absolute rounded-full bg-amber-200"
                        style={{ left: `${x}%`, top: `${58 + ((i * 11) % 22)}%`, width: "1.6cqw", height: "1.6cqw", animationDelay: `${i * 0.28}s`, boxShadow: "0 0 1.5cqw #fbbf24" }}
                      />
                    ))}
                    <div className="gift-big-img relative" style={{ width: "42cqw", height: "42cqw" }}>
                      {bigGift.icon ? (
                        <img src={bigGift.icon} alt="" referrerPolicy="no-referrer" className="h-full w-full object-contain" />
                      ) : (
                        <FaGift aria-hidden className="h-full w-full text-amber-300" />
                      )}
                    </div>
                    <div className="gift-big-banner relative mt-[2cqw] flex max-w-[92%] items-center gap-[2cqw] rounded-full border border-amber-300/40 bg-black/65 py-[1cqw] pl-[1cqw] pr-[3cqw] text-white backdrop-blur">
                      {bigGift.avatar && (
                        <img src={bigGift.avatar} alt="" referrerPolicy="no-referrer" className="shrink-0 rounded-full object-cover" style={{ width: "8cqw", height: "8cqw" }} />
                      )}
                      <span className="min-w-0 leading-tight">
                        <span className="flex items-center gap-1 font-bold" style={{ fontSize: "clamp(10px, 3.6cqw, 16px)" }}>
                          <span className="truncate">{bigGift.user ?? "Seseorang"}</span>
                          <LevelBadge level={bigGift.level} />
                        </span>
                        <span className="block truncate text-amber-200" style={{ fontSize: "clamp(9px, 3cqw, 13px)" }}>
                          mengirim {bigGift.gift}
                        </span>
                      </span>
                      <span className="font-extrabold text-amber-300" style={{ fontSize: "clamp(14px, 6cqw, 26px)" }}>
                        ×{bigGift.count ?? 1}
                      </span>
                    </div>
                  </div>
                )}
                <div className={`absolute left-2 flex max-w-[calc(100%-1rem)] flex-col items-start gap-1.5 ${audioUI ? "bottom-3" : "bottom-14"}`}>
                  {giftPopups.map((g) => (
                    <div key={g.key ?? g.id} className="flex max-w-full items-center gap-1.5 rounded-full bg-black/50 py-0.5 pl-0.5 pr-2 text-white shadow backdrop-blur-sm">
                      {g.avatar ? (
                        <img src={g.avatar} alt="" referrerPolicy="no-referrer" className="shrink-0 rounded-full object-cover" style={{ width: GIFT_SIZE, height: GIFT_SIZE }} />
                      ) : (
                        <span className="flex shrink-0 items-center justify-center rounded-full bg-white/15" style={{ width: GIFT_SIZE, height: GIFT_SIZE }}>
                          <FaGift aria-hidden className="h-1/2 w-1/2 text-amber-300" />
                        </span>
                      )}
                      <span className="min-w-0 leading-tight">
                        <span className="flex items-center gap-1 font-semibold" style={{ fontSize: "clamp(9px, 3.4cqw, 12px)" }}>
                          <span className="truncate">{g.user ?? "Seseorang"}</span>
                          {!!g.level && g.level > 0 && (
                            <span
                              title={`Level gifter ${g.level}`}
                              className={`shrink-0 rounded px-0.5 font-bold leading-snug ${g.level >= 40 ? "bg-rose-500" : g.level >= 20 ? "bg-violet-500" : "bg-sky-600"}`}
                              style={{ fontSize: "clamp(7px, 2.6cqw, 9px)" }}
                            >
                              Lv {g.level}
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-amber-200" style={{ fontSize: "clamp(8px, 3cqw, 10px)" }}>
                          {g.gift}
                        </span>
                      </span>
                      <GiftThumb src={g.icon} size={GIFT_SIZE} />
                      <span className="font-bold text-amber-300" style={{ fontSize: "clamp(10px, 4cqw, 14px)" }}>
                        ×{g.count ?? 1}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {ended && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center backdrop-blur-md">
              <div className="relative">
                {thumbnail ? (
                  <img src={thumbnail} alt="" className="h-20 w-20 rounded-full object-cover opacity-60 grayscale" />
                ) : (
                  <span className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10" />
                )}
                <span className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full border-2 border-black bg-rose-600">
                  <FaVideoSlash aria-hidden className="h-4 w-4 text-white" />
                </span>
              </div>
              <p className="text-lg font-bold text-white">Live telah berakhir</p>
              <p className="max-w-xs text-sm text-white/65">
                {username ? `@${username} sudah mengakhiri live.` : "Streamer sudah mengakhiri live."} Koneksi diputus otomatis.
              </p>
            </div>
          )}
          {needsTap && (
            <button
              type="button"
              onClick={tapToPlay}
              className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 text-sm font-semibold"
            >
              <span className="rounded-xl bg-accent px-5 py-3">Klik untuk memutar</span>
            </button>
          )}
          {autoMuted && !needsTap && (
            <button
              type="button"
              onClick={unmute}
              className="absolute left-3 top-3 z-10 rounded-lg bg-black/70 px-3 py-1.5 text-xs font-semibold backdrop-blur"
            >
              🔇 Suara mati · klik untuk menyalakan
            </button>
          )}
          {switchSlow && !loading && !audioUI && (
            <div className="pointer-events-none absolute right-3 top-3 z-[3] flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-xs font-medium text-white backdrop-blur">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Mengganti kualitas…
            </div>
          )}
          {qNotice && (
            <div className="pointer-events-none absolute left-1/2 top-3 z-[3] max-w-[90%] -translate-x-1/2 rounded-full bg-black/70 px-3 py-1.5 text-center text-xs font-medium text-white backdrop-blur">
              {qNotice}
            </div>
          )}
          {loading && slowLoad && !audioUI && !needsTap && (
            <div className="pointer-events-none absolute inset-0 z-[2] flex flex-col items-center justify-center gap-2">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
