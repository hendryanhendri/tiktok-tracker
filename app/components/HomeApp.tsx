"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FaStop, FaMagnifyingGlass, FaArrowUpRightFromSquare } from "react-icons/fa6";
import BookmarkletLink from "@/app/components/BookmarkletLink";
import Toast from "@/app/components/Toast";
import LiveStats from "@/app/components/LiveStats";
import SidePanels from "@/app/components/SidePanels";
import type { Quality } from "@/app/components/LivePlayer";
import { useTikTokTracker } from "@/app/hooks/useTikTokTracker";
import { API_URL } from "@/app/lib/config";
import { bookmarkletHref, buildQualities, decodeHash, parsePayload, type Meta } from "@/app/lib/streams";

const LivePlayer = dynamic(() => import("@/app/components/LivePlayer"), {
  ssr: false,
  loading: () => <div className="aspect-video animate-pulse rounded-2xl bg-white/5" />,
});

// tracking = true: sesi lewat backend (komentar + gift + statistik). qualities kosong = menunggu video dari bookmarklet.
type Stream = { username?: string; qualities: Quality[]; title?: string | null; cover?: string | null; tracking: boolean; key: number; vkey?: number; ended?: boolean };

const cleanUsername = (v: string) => v.trim().replace(/^@/, "");

/**
 * Halaman utama yang selalu terpasang di layout (hanya disembunyikan di halaman lain), supaya koneksi, komentar,
 * gift, dan pemutar tidak hilang saat pindah menu lalu kembali.
 */
export default function HomeApp() {
  const pathname = usePathname();
  const plain = pathname === "/video"; // menu "Video Saja": hanya video dan suara
  const tracker = useTikTokTracker();
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [stream, setStream] = useState<Stream | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackRef = useRef<(name?: string, override?: Quality[]) => Promise<void>>(async () => {});
  const streamRef = useRef<Stream | null>(null);
  streamRef.current = stream;
  const [playerLayout, setPlayerLayout] = useState<"wide" | "mobile">("wide"); // bentuk pemutar (lebar/mobile), mengatur tata letak halaman
  const tiktokWinRef = useRef<Window | null>(null); // tab TikTok yang dibuka aplikasi (agar bookmark bisa mengirim balik)
  const [bookmarkSeen, setBookmarkSeen] = useState(false); // bookmark pernah dipakai di browser ini

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }, []);

  /* ---------- Cadangan: video dari bookmarklet / tempel URL ---------- */
  const openUrls = useCallback(
    (urls: string[], name?: string, meta?: Record<string, Meta>) => {
      const qualities = buildQualities(urls, meta);
      if (!qualities.length) return showToast("Tidak ada URL video (.m3u8 / .flv) yang ditemukan.", "error");
      setStream({ username: name, qualities, tracking: false, key: Date.now() });
      showToast(`${qualities.length} pilihan kualitas ditemukan.`, "success");
    },
    [showToast],
  );

  useEffect(() => {
    try {
      setBookmarkSeen(localStorage.getItem("tt-bookmark-ok") === "1");
    } catch {
      /* penyimpanan tidak tersedia */
    }
  }, []);

  // Terima video dari bookmarklet (lewat postMessage dari tab TikTok, atau lewat alamat #s=...).
  const receive = useCallback(
    (data: { urls: string[]; username?: string; meta?: Record<string, Meta> }) => {
      const qualities = buildQualities(data.urls, data.meta);
      if (!qualities.length) return showToast("Tidak ada URL video (.m3u8 / .flv) yang ditemukan.", "error");
      try {
        localStorage.setItem("tt-bookmark-ok", "1");
      } catch {
        /* abaikan */
      }
      setBookmarkSeen(true);
      tiktokWinRef.current?.close(); // video sudah diterima: tab TikTok tidak diperlukan lagi
      const cur = streamRef.current;
      if (cur?.tracking && (!data.username || cur.username?.toLowerCase() === data.username.toLowerCase())) {
        // Sesi sudah berjalan (sedang menunggu video): pasang video tanpa memutus komentar/gift.
        setStream({ ...cur, qualities, vkey: Date.now() });
        showToast("Video diterima.", "success");
      } else if (data.username) {
        void trackRef.current(data.username, qualities); // mulai komentar/gift, video dari bookmarklet
      } else {
        openUrls(data.urls, undefined, data.meta);
      }
    },
    [openUrls, showToast],
  );

  useEffect(() => {
    const load = () => {
      if (window.location.pathname === "/shopee") return; // kiriman bookmark Shopee ditangani ShopeeApp
      const data = decodeHash(window.location.hash);
      if (!data) return;
      history.replaceState(null, "", window.location.pathname);
      if (data.version < 2) showToast("Bookmark Anda versi lama dan bisa memutar streamer yang salah. Hapus, lalu pasang ulang tombol dari halaman ini.", "error");
      receive(data);
    };
    load();
    window.addEventListener("hashchange", load);
    return () => window.removeEventListener("hashchange", load);
  }, [receive, showToast]);

  // Pesan dari tab TikTok yang dibuka aplikasi ini. Asal pesan diperiksa ketat.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== "https://www.tiktok.com" && e.origin !== "https://tiktok.com") return;
      if (e.data?.type !== "tt-streams") return;
      const data = parsePayload(e.data.payload);
      if (data) receive(data);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [receive]);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  /* ---------- Track lewat backend ---------- */
  const handleTrack = async (nameArg?: string, override?: Quality[]) => {
    const name = cleanUsername(nameArg ?? username);
    if (!name) return showToast("Masukkan username TikTok dulu.", "error");
    setUsername(name);
    setLoading(true);
    // Tanpa backend/live terdeteksi: tetap putar video dari bookmarklet.
    const videoOnly = () => override?.length && setStream({ username: name, qualities: override, tracking: false, key: Date.now() });
    try {
      const res = await fetch(`${API_URL}/set_username`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal mengambil data live.");
      if (!json.isLive) {
        if (videoOnly()) return showToast("Server tidak mendeteksi live ini; memutar video dari bookmarklet saja.", "error");
        tiktokWinRef.current?.close(); // tidak live: tab TikTok yang tadi dibuka tidak diperlukan
        return showToast(`@${name} sedang tidak live.`, "error");
      }

      const qualities: Quality[] = override?.length ? override : (json.qualities ?? []);
      tracker.connect(name);
      setStream({
        username: name,
        qualities,
        title: json.title,
        cover: json.coverUrl,
        tracking: true,
        key: Date.now(),
      });
      if (!qualities.length) {
        showToast("Live terhubung. Klik bookmark 🎬 di tab TikTok untuk memuat video.", "success");
      } else if (json.chat && !json.chat.ok) {
        showToast(`Video siap, tapi komentar/gift tidak tersambung: ${json.chat.error}`, "error");
      } else {
        showToast(`Tracking @${name} dimulai.`, "success");
        if (!override?.length) tiktokWinRef.current?.close(); // video sudah tersedia dari server: tab TikTok tidak perlu
      }
    } catch (err) {
      console.warn("set_username:", err);
      if (videoOnly()) return showToast("Backend tidak tersambung: hanya video dari bookmarklet yang diputar.", "error");
      showToast(
        err instanceof TypeError ? "Gagal terhubung ke server. Pastikan backend berjalan (npm run server)." : (err as Error).message,
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  trackRef.current = handleTrack;

  // Live berakhir (kabar dari server): putus otomatis, hentikan sesi di server, tapi biarkan komentar/gift tetap terlihat.
  const endedHandledRef = useRef(false);
  useEffect(() => {
    if (!stream?.tracking) {
      endedHandledRef.current = false;
      return;
    }
    if (tracker.connectionStatus !== "ended" || endedHandledRef.current) return;
    endedHandledRef.current = true;
    void fetch(`${API_URL}/stop_tracking`, { method: "POST" }).catch(() => {});
    tracker.stop("ended");
    setStream((s) => (s ? { ...s, ended: true } : s));
    showToast(`Live @${stream.username ?? ""} telah berakhir. Koneksi diputus otomatis.`, "success");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracker.connectionStatus, stream?.tracking]);

  const handleClose = async () => {
    if (stream?.tracking) {
      try {
        await fetch(`${API_URL}/stop_tracking`, { method: "POST" });
      } catch {
        /* server mungkin sudah mati */
      }
      tracker.disconnect();
    }
    setStream(null);
    setUsername(""); // jangan menyisakan username lama di kolom setelah ditutup
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (stream) return void handleClose();
    const name = cleanUsername(username);
    if (!name) return void showToast("Masukkan username TikTok dulu.", "error");
    // Dibuka langsung dari klik ini (tanpa await) agar tidak diblokir popup blocker. Sengaja tanpa "noopener":
    // tab ini harus tahu siapa pembukanya supaya bookmark bisa mengirim video balik ke sini.
    tiktokWinRef.current = window.open(`https://www.tiktok.com/@${encodeURIComponent(name)}/live`, "tt-live");
    void handleTrack(name);
  };

  return (
    <div hidden={pathname !== "/" && !plain}>
    <div
      className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pb-8"
      // Saat live berjalan (tampilan biasa): lebar menyesuaikan tinggi layar, sehingga video 16:9 + panel samping (380px + jarak + padding)
      // paling besar yang masih muat tanpa scroll. Layar rendah -> lebih sempit; layar tinggi/lebar -> sampai 96rem.
      style={
        stream && !plain
          ? { maxWidth: playerLayout === "mobile" ? "72rem" : "max(72rem, min(96rem, calc((100dvh - 17rem) * 16 / 9 + 436px)))" }
          : stream && plain
            ? { maxWidth: "96rem" }
            : undefined
      }
    >
      <AnimatePresence>{toast && <Toast key="toast" message={toast.message} type={toast.type} />}</AnimatePresence>

      {/* Saat live berjalan, judul dan form disembunyikan agar video (+ chat) muat dalam satu layar. Di "Video Saja", tombol Tutup ada di dalam pemutar. */}
      {!stream && (
      <motion.section
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mx-auto w-full max-w-2xl pt-6 text-center"
      >
        {!plain && (
          <>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          TikTok <span className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-transparent">Live Player</span>
        </h1>
        <p className="mt-2 text-sm text-muted sm:text-base">Tonton live TikTok dengan pilihan kualitas, plus komentar dan gift.</p>
          </>
        )}

        <form
          onSubmit={onSubmit}
          className="mt-6 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3 backdrop-blur-md sm:flex-row"
        >
          <label className="relative flex-1">
            <span className="sr-only">Username TikTok</span>
            <span aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted">
              @
            </span>
            <input
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="username"
              value={username}
              disabled={!!stream || loading}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl border border-line bg-black/20 py-3 pl-9 pr-4 text-sm placeholder:text-muted/60 focus:border-accent-2 disabled:opacity-60"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className={`flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold transition ${
              stream ? "bg-rose-600 hover:bg-rose-500" : "bg-accent hover:brightness-110"
            }`}
          >
            {loading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Menghubungkan…
              </>
            ) : stream ? (
              <>
                <FaStop aria-hidden className="h-3.5 w-3.5" /> Tutup
              </>
            ) : (
              <>
                <FaMagnifyingGlass aria-hidden className="h-3.5 w-3.5" /> Mulai
              </>
            )}
          </button>
        </form>
      </motion.section>
      )}

      {stream ? (
        <motion.section key={stream.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
          {!plain && (
            <>
          {stream.tracking ? (
            <LiveStats
              username={stream.username ?? ""}
              status={tracker.connectionStatus}
              viewerCount={tracker.viewerCount}
              totalViews={tracker.totalViews}
              gifts={tracker.gifts.length}
              comments={tracker.commentTotal}
              title={stream.title}
              onClose={handleClose}
            />
          ) : (
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2 py-0.5 text-[11px] font-bold tracking-wide">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> LIVE
              </span>
              <h2 className="truncate text-xl font-semibold">{stream.username ? `@${stream.username}` : "Live TikTok"}</h2>
              <button
                type="button"
                onClick={handleClose}
                className="ml-auto flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold hover:bg-rose-500"
              >
                <FaStop aria-hidden className="h-3 w-3" /> Tutup
              </button>
            </div>
          )}
            </>
          )}


          <div className={stream.tracking && !plain ? `grid items-start gap-6 lg:items-stretch ${playerLayout === "mobile" ? "lg:grid-cols-[max-content_minmax(0,1fr)]" : "lg:grid-cols-[minmax(0,1fr)_380px]"}` : ""}>
            <div className={stream.tracking && !plain ? "min-w-0" : ""}>
            {stream.qualities.length > 0 ? (
              <div className={stream.tracking && !plain ? (playerLayout === "mobile" ? "w-max max-w-full" : "w-full") : plain ? "mx-auto w-full" : "mx-auto w-full max-w-3xl"}
                style={plain ? { maxWidth: "calc((100dvh - 6.5rem) * 16 / 9)" } : undefined}
              >
                <LivePlayer key={stream.vkey ?? 0} qualities={stream.qualities} username={stream.username} thumbnail={stream.cover} plain={plain} onLayoutChange={setPlayerLayout} onClose={plain ? handleClose : undefined} ended={!!stream.ended} gifts={stream.tracking && !plain ? tracker.gifts : undefined} goals={stream.tracking && !plain ? tracker.goals : undefined} />
              </div>
            ) : (
              <div className="mx-auto w-full max-w-3xl rounded-2xl border border-line bg-surface px-6 py-8 text-center backdrop-blur-md">
                <span className="mx-auto mb-4 block h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                <p className="font-semibold">Menunggu video dari TikTok</p>
                <ol className="mx-auto mt-4 max-w-sm space-y-2 text-left text-sm text-muted">
                  <li>
                    <b className="text-white">1.</b> Buka tab TikTok{" "}
                    <button
                      type="button"
                      onClick={() => {
                        if (stream.username) {
                          tiktokWinRef.current = window.open(`https://www.tiktok.com/@${encodeURIComponent(stream.username)}/live`, "tt-live");
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1 text-xs font-semibold text-white"
                    >
                      Buka <FaArrowUpRightFromSquare aria-hidden className="h-2.5 w-2.5" />
                    </button>
                  </li>
                  <li>
                    <b className="text-white">2.</b> Putar live-nya
                  </li>
                  <li>
                    <b className="text-white">3.</b> Klik bookmark 🎬
                  </li>
                </ol>
                {!bookmarkSeen && (
                  <div className="mt-5 rounded-xl border border-accent/40 bg-accent/10 p-4 text-sm text-muted">
                    <p className="mb-2">Belum punya bookmark? Klik dan tahan tombol ini, lalu lepas di bookmark bar:</p>
                    <BookmarkletLink onBlocked={() => showToast("Klik biasa tidak memasang. Klik dan tahan tombolnya, lalu lepas di bookmark bar.", "error")} />
                  </div>
                )}
              </div>
            )}
            </div>

            {stream.tracking && !plain && (
              <aside className="min-w-0 lg:relative lg:min-h-[26rem]">
                <SidePanels
                  comments={tracker.comments}
                  commentTotal={tracker.commentTotal}
                  gifts={tracker.gifts}
                  onClearComments={() => {
                    tracker.clearComments();
                    showToast("Komentar dibersihkan.", "success");
                  }}
                  onExportEmpty={() => showToast("Belum ada komentar untuk diekspor.", "error")}
                />
              </aside>
            )}
          </div>
        </motion.section>
      ) : (
        <section className="mx-auto w-full max-w-2xl space-y-4">
          <div className="rounded-2xl border border-accent/40 bg-gradient-to-br from-accent/15 to-accent-2/10 px-6 py-6">
            <p className="text-center text-base font-semibold">Pakai bookmark 🎬</p>
            <p className="mt-1 text-center text-sm text-muted">Cara paling lengkap: video, komentar, dan gift.</p>

            <ol className="mt-5 space-y-4 text-sm text-muted">
              <li>
                <b className="text-white">1.</b> Klik dan tahan tombol ini, lalu lepas di bookmark bar:
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <BookmarkletLink onBlocked={() => showToast("Klik biasa tidak memasang. Klik dan tahan tombolnya, lalu lepas di bookmark bar.", "error")} />
                  <button
                    type="button"
                    onClick={async () => {
                      const code = bookmarkletHref(window.location.origin);
                      try {
                        await navigator.clipboard.writeText(code);
                        showToast("Kode bookmarklet tersalin.", "success");
                      } catch {
                        window.prompt("Salin kode bookmarklet ini:", code);
                      }
                    }}
                    className="rounded-xl border border-line bg-white/5 px-3 py-2 text-xs font-medium text-white transition hover:bg-white/10"
                  >
                    Salin kode
                  </button>
                </div>
              </li>
              <li>
                <b className="text-white">2.</b> Ketik username di atas lalu klik <b className="text-white">Mulai</b>. Tab TikTok terbuka otomatis.
              </li>
              <li>
                <b className="text-white">3.</b> Di tab TikTok, putar live-nya lalu klik bookmark.
              </li>
            </ol>
            <p className="mt-4 text-center text-xs">
              <Link href="/doc" className="text-accent-2 hover:underline">
                Dokumentasi: kapan perlu bookmark, login, dan live 18+
              </Link>
            </p>
          </div>
        </section>
      )}
    </div>
    </div>
  );
}
