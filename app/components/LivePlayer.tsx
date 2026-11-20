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
} from "react-icons/fa6";
import type { IconType } from "react-icons";
import { API_URL } from "@/app/lib/config";

export type Quality = { id: string; label: string; url: string; alts?: string[]; height?: number; audioOnly?: boolean };
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

/**
 * Paling banyak tiga opsi: Original (tertinggi) + dua di bawahnya, diutamakan yang paling dekat 720p dan 540p.
 * Bila salah satunya tidak tersedia, diisi kualitas di bawahnya secara berurutan. Hasil urut tertinggi -> terendah.
 */
function pickThree(qs: Quality[]): Quality[] {
  const desc = [...qs].reverse();
  if (desc.length <= 3) return desc;
  const [top, ...rest] = desc;
  const chosen: Quality[] = [];
  for (const want of [720, 540]) {
    const hit = rest.find((q) => parseInt(friendlyQuality(q), 10) === want && !chosen.includes(q));
    if (hit) chosen.push(hit);
  }
  for (const q of rest) {
    if (chosen.length >= 2) break;
    if (!chosen.includes(q)) chosen.push(q);
  }
  chosen.sort((x, y) => desc.indexOf(x) - desc.indexOf(y));
  return [top, ...chosen];
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

export default function LivePlayer({
  qualities,
  username,
  thumbnail,
  initialMode = "video",
  plain = false,
}: {
  qualities: Quality[];
  username?: string;
  thumbnail?: string | null;
  initialMode?: "video" | "audio";
  /** Tampilan polos: hanya video + suara (tanpa toolbar, menu pengaturan, rekam, atau info teknis). */
  plain?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  // Daftar masuk urut rendah -> tinggi.
  const videoQ = qualities.filter((q) => !q.audioOnly);
  const audioQ = qualities.find((q) => q.audioOnly);
  const lowestVideo = videoQ[0];
  const qOptions = pickThree(videoQ); // tiga opsi saja: Original + dua di bawahnya (utamanya 720p dan 540p)
  const qNames = new Map(qOptions.map((q, i) => [q.id, i === 0 ? "Original" : friendlyQuality(q)]));

  const [mode, setMode] = useState<Mode>(initialMode);
  const [videoId, setVideoId] = useState(videoQ.at(-1)?.id ?? qualities.at(-1)?.id ?? "");
  const [useProxy, setUseProxy] = useState(false);
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
  const [lag, setLag] = useState<number | null>(null); // perkiraan jeda: buffer di depan posisi putar (detik)
  const [playing, setPlaying] = useState(true);
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
  const [layoutUser, setLayoutUser] = useState<Layout | null>(null); // pilihan orientasi pengguna (null = otomatis)
  const [isFs, setIsFs] = useState(false);
  const [canPip, setCanPip] = useState(false);
  const [failReason, setFailReason] = useState<string | null>(null);
  const [dims, setDims] = useState<string | null>(null); // resolusi yang benar-benar sedang diputar
  // Rekam (di browser, tanpa instalasi apa pun)
  type RecState = { kind: "video" | "audio"; startedAt: number; toDisk: boolean };
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
      : (videoQ.find((q) => q.id === videoId) ?? videoQ.at(-1) ?? qualities[0]);
  const candidates = selected ? [selected.url, ...(selected.alts ?? [])] : [];
  const baseUrl = candidates[variant] ?? selected?.url ?? "";
  const src = baseUrl ? (useProxy ? `${API_URL}/proxy?u=${encodeURIComponent(baseUrl)}` : baseUrl) : "";
  const audioModeRef = useRef(false);
  audioModeRef.current = mode === "audio";

  useEffect(() => {
    const video = videoRef.current;
    if (!src || !video) return;
    setLoading(true);
    setFailed(false);
    setFailReason(null);
    setNeedsTap(false);
    setAutoMuted(false);
    setDims(null);
    mediaInfoRef.current = {};
    statsRef.current = { waiting: 0, stalled: 0, errors: [] };
    log(`mulai: varian ${variant + 1}/${candidates.length} ${useProxy ? "via proxy" : "langsung"} (${isFlv(src) ? "FLV" : "HLS"})`);

    let cancelled = false;
    let destroy: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const failAll = (reason: string) => {
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
    const onReady = () => {
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
      const ctrl = new AbortController();
      if (!isFlv(src)) try {
        const res = await fetch(src, { signal: ctrl.signal, cache: "no-store" });
        ctrl.abort();
        if (cancelled) return;
        log(`preflight HTTP ${res.status}`);
        if ([403, 404, 410].includes(res.status)) {
          return fail(
            `TikTok membalas HTTP ${res.status}. Live kemungkinan sudah berakhir atau URL kedaluwarsa. Buka live-nya lagi lalu klik bookmarklet.`,
            true,
          );
        }
      } catch (e) {
        if (cancelled) return;
        log(`preflight gagal: ${String((e as Error)?.message ?? e).slice(0, 80)}`);
        if (!useProxy) return fail(""); // CORS/jaringan -> proxy
      }

      timer = setTimeout(() => fail("Tidak ada data video setelah 12 detik. Coba kualitas lain atau ambil ulang URL.", useProxy), 12000);

      if (isFlv(src)) {
        // FLV (umum dipakai live TikTok, sering berisi HEVC/H.265) -> mpegts.js (flv.js hanya mendukung H.264)
        try {
          const { default: mpegts } = await import("mpegts.js");
          if (cancelled) return;
          if (!mpegts.getFeatureList().mseLivePlayback) return fail("Browser tidak mendukung pemutaran FLV live.", true);
          const player = mpegts.createPlayer(
            { type: "flv", isLive: true, url: src },
            {
              enableStashBuffer: !lowLatency,
              autoCleanupSourceBuffer: true,
              // Mengejar tepi live: bila jeda melebihi batas, percepat/loncat mendekati live.
              liveBufferLatencyChasing: lowLatency,
              liveBufferLatencyMaxLatency: 2,
              liveBufferLatencyMinRemain: 0.5,
            },
          );
          player.attachMediaElement(video);
          player.on(mpegts.Events.ERROR, (type: string, detail: string, info: unknown) => {
            log(`FLV error ${type}/${detail} ${JSON.stringify(info ?? {}).slice(0, 160)}`);
            const reason = `FLV error: ${type} / ${detail}`;
            // Codec tidak didukung bukan masalah jaringan: lewati proxy, langsung coba varian lain.
            if (/CodecUnsupported|Unsupported codec/i.test(`${detail} ${JSON.stringify(info ?? {})}`)) {
              log("codec tidak didukung -> varian berikutnya");
              return nextVariant(`Codec video tidak didukung browser ini (${detail}).`);
            }
            fail(reason);
          });
          player.on(mpegts.Events.MEDIA_INFO, (info: Record<string, unknown>) => {
            const { metadata: _m, ...rest } = info as { metadata?: unknown } & Record<string, unknown>; // eslint-disable-line @typescript-eslint/no-unused-vars
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
        const hls = new Hls(
          lowLatency
            ? { lowLatencyMode: true, liveSyncDurationCount: 2, liveMaxLatencyDurationCount: 4, maxBufferLength: 8, backBufferLength: 10 }
            : { lowLatencyMode: false, liveSyncDurationCount: 4, maxBufferLength: 30 },
        );
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
          mediaInfoRef.current = {
            ...mediaInfoRef.current,
            kind: "hls",
            levels: data.levels.map((l) => ({ w: l.width, h: l.height, kbps: Math.round(l.bitrate / 1000), v: l.videoCodec, a: l.audioCodec })),
          };
          void tryPlay();
        });
        hls.on(Hls.Events.BUFFER_CODECS, (_e, d) => {
          mediaInfoRef.current = {
            ...mediaInfoRef.current,
            bufferCodecs: { video: d.video ? d.video.codec : "TIDAK ADA", audio: d.audio ? d.audio.codec : "TIDAK ADA" },
          };
        });
        hls.on(Hls.Events.ERROR, (_e, data) => {
          console.warn("HLS error:", data.type, data.details);
          if (data.fatal) fail(`HLS error: ${data.details}`);
        });
        destroy = () => hls.destroy();
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
      destroy?.();
    };
  }, [src, useProxy, variant, candidates.length, log, lowLatency]);


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
      `varian: ${variant + 1}/${candidates.length} | via proxy: ${useProxy}`,
      ...candidates.map((u, i) => `  ${i === variant ? ">" : " "} ${i + 1}. ${isFlv(u) ? "FLV" : "HLS"} ${new URL(u).host}/…/${u.split("?")[0].split("/").pop()}`),
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
    if (v.muted) return setRecMsg("Suara video sedang mati, hasil rekaman akan tanpa suara. Nyalakan suara dulu (klik 'Suara mati' di pemutar), lalu rekam lagi.");
    const tracks = kind === "audio" ? cap.getAudioTracks() : cap.getTracks();
    if (!tracks.length) return setRecMsg("Belum ada data untuk direkam. Tunggu sampai video tampil.");

    const wanted =
      kind === "audio"
        ? ["audio/mp4;codecs=mp4a.40.2", "audio/webm;codecs=opus", "audio/webm"]
        : ["video/mp4;codecs=avc1.640028,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    const mime = wanted.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    const isMp4 = mime.startsWith("video/mp4") || mime.startsWith("audio/mp4");
    const ext = kind === "audio" ? (isMp4 ? "m4a" : "webm") : isMp4 ? "mp4" : "webm";
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `tiktok_${username ?? "live"}_${stamp}_${kind}.${ext}`;

    // Chrome/Edge: tulis langsung ke disk (aman untuk rekaman panjang). Lainnya: simpan di memori (dibatasi).
    // Harus dipanggil langsung dari klik pengguna, sebelum await lain.
    let writable: FileSystemWritableFileStream | null = null;
    const picker = (window as unknown as { showSaveFilePicker?: (o: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker;
    if (picker) {
      try {
        const handle = await picker({
          suggestedName: filename,
          types: [{ description: kind === "audio" ? "Audio" : "Video", accept: { [mime.split(";")[0] || `${kind}/webm`]: [`.${ext}`] } }],
        });
        writable = await handle.createWritable();
      } catch (e) {
        if ((e as Error).name === "AbortError") return; // pengguna membatalkan dialog simpan
        writable = null;
      }
    }

    const mr = new MediaRecorder(new MediaStream(tracks), {
      ...(mime ? { mimeType: mime } : {}),
      videoBitsPerSecond: 4_000_000,
      audioBitsPerSecond: 128_000,
    });
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
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 10_000);
          setRecMsg(`Diunduh: ${filename} (${fmtBytes(recBytesRef.current)})`);
        } else setRecMsg("Tidak ada data yang terekam.");
      } catch (err) {
        setRecMsg(`Gagal menyimpan rekaman: ${(err as Error).message}`);
      } finally {
        recorderRef.current = null;
        setRec(null);
      }
    };
    mr.onerror = () => setRecMsg("Perekaman terhenti karena error.");
    recorderRef.current = mr;
    mr.start(1000);
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
  }, [failed]);
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

  // Ukur jeda buffer tiap detik.
  useEffect(() => {
    const t = setInterval(() => {
      const v = videoRef.current;
      if (!v || v.paused || !v.buffered.length) return setLag(null);
      setLag(Math.max(0, v.buffered.end(v.buffered.length - 1) - v.currentTime));
    }, 1000);
    return () => clearInterval(t);
  }, []);
  const goLive = () => {
    const v = videoRef.current;
    if (v && v.buffered.length) v.currentTime = Math.max(0, v.buffered.end(v.buffered.length - 1) - 0.3);
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
  const changeQuality = (id: string) => {
    giveUpVideoRef.current = false;
    setNoVideo(false);
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
  const effLayout: Layout = layoutUser ?? (plain && portrait ? "mobile" : "wide"); // otomatis: mode polos mengikuti bentuk video
  const audioUI = audioMode || noVideoUi; // tampilan panel audio (dipilih pengguna, atau stream memang tanpa gambar)

  return (
    <div className={plain ? "overflow-hidden rounded-xl bg-black" : "overflow-hidden rounded-2xl border border-line bg-surface shadow-xl backdrop-blur-md"}>
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
              onClick={startRecording}
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
              Sumber: <span className="text-white/80">{baseUrl.split("?")[0].split("/").pop()}</span> ·{" "}
              {isFlv(baseUrl) ? "FLV" : "HLS"} · {useProxy ? "via proxy" : "langsung"}
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
          <FaTriangleExclamation aria-hidden className="h-6 w-6 text-amber-300" />
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
          className={`relative bg-black ${
            audioUI ? "" : isFs ? "h-screen w-screen" : effLayout === "mobile" ? "mx-auto aspect-[9/16] max-h-[78vh]" : "aspect-video"
          }`}
        >
          {/* Elemen video tetap ada di mode audio agar suara terus diputar */}
          <video
            ref={videoRef}
            controls={!audioUI}
            controlsList="nofullscreen"
            autoPlay
            playsInline
            className={audioUI ? "sr-only" : "h-full w-full bg-black object-contain"}
          />
          {/* Pengaturan di dalam pemutar (gaya TikTok): menu utama + panel kualitas di sampingnya */}
          {!audioUI && (
            <div ref={menuRef} className="absolute right-3 top-3 z-20 flex flex-col items-end gap-2">
              <div className="flex gap-2">
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
                    className="w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-[#262626]/95 p-2 text-[15px] text-white shadow-2xl backdrop-blur-xl"
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
                    {qOptions.length > 1 && (
                      <MenuRow
                        icon={FaSliders}
                        label="Kualitas"
                        value={qNames.get(selected?.id ?? "") ?? "Original"}
                        chevron
                        active={menuView === "quality"}
                        onClick={() => setMenuView((v) => (v === "quality" ? "main" : "quality"))}
                      />
                    )}
                    {plain && (
                      <MenuRow
                        icon={FaHeadphones}
                        label="Audio saja"
                        onClick={() => {
                          changeMode("audio");
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
                    {canPip && (
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
                      className="absolute inset-0 z-10 flex flex-col rounded-2xl border border-white/10 bg-[#262626] p-2 text-[15px] text-white shadow-2xl sm:inset-auto sm:right-[calc(100%+0.5rem)] sm:top-0 sm:w-60 sm:bg-[#262626]/95 sm:backdrop-blur-xl"
                    >
                      <button
                        type="button"
                        onClick={() => setMenuView("main")}
                        className="mb-1 flex w-full items-center gap-2 rounded-xl px-4 py-2.5 text-left text-sm text-white/70 transition hover:bg-white/10 sm:hidden"
                      >
                        <FaChevronLeft aria-hidden className="h-3.5 w-3.5" /> Kualitas
                      </button>
                      {qOptions.map((q) => {
                        const name = qNames.get(q.id) ?? q.label;
                        const active = q.id === selected?.id;
                        return (
                          <button
                            key={q.id}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            title={q.label}
                            onClick={() => {
                              changeQuality(q.id);
                              setMenuOpen(false);
                            }}
                            className={`flex w-full items-center justify-between gap-3 rounded-xl px-5 py-3.5 text-left transition hover:bg-white/10 ${active ? "font-semibold" : "text-white/85"}`}
                          >
                            <span>{name}</span>
                            {active && <FaCheck aria-hidden className="h-4 w-4 text-white" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {audioUI && (
            <div className="relative flex flex-col items-center gap-4 overflow-hidden px-6 py-10 text-center">
              {thumbnail && (
                <img src={thumbnail} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-20 blur-2xl" />
              )}
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
                    style={loading ? undefined : { height: `${10 + ((i * 7) % 14)}px`, animationDelay: `${i * 120}ms` }}
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
                {lag !== null && lag > 2.5 && (
                  <button
                    type="button"
                    onClick={goLive}
                    className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/20"
                  >
                    Ke live · tertinggal ±{Math.round(lag)} dtk
                  </button>
                )}
              </div>
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
          {loading && !audioUI && !needsTap && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
