"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { FaStop, FaArrowUpRightFromSquare } from "react-icons/fa6";
import Toast from "@/app/components/Toast";
import BookmarkletLink from "@/app/components/BookmarkletLink";
import type { Quality } from "@/app/components/LivePlayer";
import { bookmarkletHref, buildQualities, decodeHash, parsePayload, type Meta } from "@/app/lib/streams";

const LivePlayer = dynamic(() => import("@/app/components/LivePlayer"), {
  ssr: false,
  loading: () => <div className="aspect-video animate-pulse rounded-2xl bg-white/5" />,
});

type Stream = { qualities: Quality[]; key: number };

// Hanya situs Shopee yang boleh dibuka dari kolom tautan dan boleh mengirim video balik ke tab ini.
const isShopeeHost = (h: string) => /(^|\.)shopee\.[a-z.]+$/i.test(h);
const isShopeeOrigin = (o: string) => {
  try {
    const u = new URL(o);
    return u.protocol === "https:" && isShopeeHost(u.hostname);
  } catch {
    return false;
  }
};
const APP_PATH = "/shopee";

/**
 * Tab Shopee Live: hanya menonton (tanpa login). Shopee menandatangani permintaan API-nya di halaman webnya sendiri, jadi video
 * diambil dari tab Shopee yang sedang memutar live lewat bookmark, lalu diputar di pemutar yang sama dengan TikTok.
 * Terpasang di layout (disembunyikan di halaman lain) agar pemutarnya tidak berhenti saat pindah menu.
 */
export default function ShopeeApp() {
  const pathname = usePathname();
  const active = pathname === APP_PATH;

  const [link, setLink] = useState("");
  const [stream, setStream] = useState<Stream | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const winRef = useRef<Window | null>(null); // tab Shopee yang dibuka aplikasi (agar bookmark bisa mengirim balik)

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }, []);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const receive = useCallback(
    (data: { urls: string[]; meta?: Record<string, Meta> }) => {
      const qualities = buildQualities(data.urls, data.meta);
      if (!qualities.length) return showToast("Tidak ada URL video (.m3u8 / .flv) yang ditemukan.", "error");
      setStream({ qualities, key: Date.now() });
      showToast(`${qualities.length} pilihan kualitas ditemukan.`, "success");
      winRef.current?.close(); // video sudah diterima: tab Shopee tidak diperlukan lagi
    },
    [showToast],
  );

  // Kiriman bookmark lewat alamat (#s=...), bila bookmark harus membuka tab baru.
  useEffect(() => {
    const load = () => {
      if (window.location.pathname !== APP_PATH) return;
      const data = decodeHash(window.location.hash);
      if (!data) return;
      history.replaceState(null, "", window.location.pathname);
      receive(data);
    };
    load();
    window.addEventListener("hashchange", load);
    return () => window.removeEventListener("hashchange", load);
  }, [receive]);

  // Kiriman bookmark lewat postMessage dari tab Shopee yang dibuka aplikasi ini. Asal pesan diperiksa ketat.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!isShopeeOrigin(e.origin) || e.data?.type !== "tt-streams") return;
      const data = parsePayload(e.data.payload);
      if (data) receive(data);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [receive]);

  const openLive = (e: React.FormEvent) => {
    e.preventDefault();
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(link.trim()) ? link.trim() : `https://${link.trim()}`);
    } catch {
      return showToast("Tempel tautan live Shopee dulu.", "error");
    }
    if (url.protocol !== "https:" || !isShopeeHost(url.hostname)) return showToast("Itu bukan tautan Shopee. Tempel tautan live dari aplikasi atau situs Shopee.", "error");
    // Dibuka langsung dari klik ini (tanpa await) agar tidak diblokir popup blocker. Sengaja tanpa "noopener": tab itu harus tahu
    // siapa pembukanya supaya bookmark bisa mengirim video balik ke sini.
    winRef.current = window.open(url.toString(), "shp-live");
    showToast("Tab Shopee terbuka. Putar live-nya lalu klik bookmark.", "success");
  };

  const close = () => {
    setStream(null);
    setLink("");
  };

  return (
    <div hidden={!active}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-8">
        <AnimatePresence>{toast && <Toast key="toast" message={toast.message} type={toast.type} />}</AnimatePresence>

        {stream ? (
          <motion.section key={stream.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
            <div className="mx-auto flex w-full items-center gap-3" style={{ maxWidth: "calc((100dvh - 15rem) * 16 / 9)" }}>
              <span className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2 py-0.5 text-[11px] font-bold tracking-wide">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> LIVE
              </span>
              <h2 className="truncate text-xl font-semibold">Shopee Live</h2>
              <button
                type="button"
                onClick={close}
                className="ml-auto flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold hover:bg-rose-500"
              >
                <FaStop aria-hidden className="h-3 w-3" /> Tutup
              </button>
            </div>
            <div className="mx-auto w-full" style={{ maxWidth: "calc((100dvh - 15rem) * 16 / 9)" }}>
              <LivePlayer key={stream.key} qualities={stream.qualities} />
            </div>
          </motion.section>
        ) : (
          <>
            <motion.section initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="mx-auto w-full max-w-2xl pt-6 text-center">
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Shopee <span className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-transparent">Live Player</span>
              </h1>
              <p className="mt-2 text-sm text-muted sm:text-base">Tonton live Shopee dengan pilihan kualitas, rekam, dan layar penuh. Hanya menonton, tanpa login.</p>

              <form onSubmit={openLive} className="mt-6 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3 sm:flex-row">
                <label className="relative flex-1">
                  <span className="sr-only">Tautan live Shopee</span>
                  <input
                    type="text"
                    inputMode="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="Tempel tautan live Shopee (live.shopee.co.id/share?...)"
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    className="w-full rounded-xl border border-line bg-black/20 px-4 py-3 text-sm placeholder:text-muted/60 focus:border-accent-2"
                  />
                </label>
                <button type="submit" className="flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-semibold transition hover:brightness-110">
                  <FaArrowUpRightFromSquare aria-hidden className="h-3.5 w-3.5" /> Buka live
                </button>
              </form>
            </motion.section>

            <section className="mx-auto w-full max-w-2xl space-y-4">
              <div className="rounded-2xl border border-accent/40 bg-gradient-to-br from-accent/15 to-accent-2/10 px-6 py-6">
                <p className="text-center text-base font-semibold">Pakai bookmark 🛍️</p>
                <p className="mt-1 text-center text-sm text-muted">Shopee hanya mengizinkan video diambil dari halaman live-nya sendiri.</p>
                <ol className="mt-5 space-y-4 text-sm text-muted">
                  <li>
                    <b className="text-white">1.</b> Klik dan tahan tombol ini, lalu lepas di bookmark bar (sekali saja):
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <BookmarkletLink
                        appPath={APP_PATH}
                        label="🛍️ Shopee Live"
                        onBlocked={() => showToast("Klik biasa tidak memasang. Klik dan tahan tombolnya, lalu lepas di bookmark bar.", "error")}
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          const code = bookmarkletHref(window.location.origin, APP_PATH);
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
                    <b className="text-white">2.</b> Tempel tautan live di atas lalu klik <b className="text-white">Buka live</b>. Tab Shopee terbuka otomatis.
                  </li>
                  <li>
                    <b className="text-white">3.</b> Di tab Shopee, putar live-nya (tunggu videonya tampil), lalu klik bookmark. Videonya muncul di sini dan tab Shopee menutup sendiri.
                  </li>
                </ol>
                <p className="mt-4 text-center text-xs text-muted">Komentar dan gift Shopee belum tersedia di tab ini; hanya video dan suara.</p>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
