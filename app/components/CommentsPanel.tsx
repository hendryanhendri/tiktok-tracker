/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Avatar, { colorOf } from "@/app/components/Avatar";
import { FaArrowDown, FaComment, FaDownload, FaMagnifyingGlass, FaPause, FaPlay, FaTrashCan, FaXmark } from "react-icons/fa6";

const VISIBLE = 200; // jumlah baris yang dirender agar tetap ringan saat live ramai

const time = (ts?: number) =>
  ts ? new Date(ts).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "";

export default function CommentsPanel({
  comments,
  total,
  onClear,
  onExportEmpty,
  className = "h-[26rem]",
}: {
  comments: any[];
  total?: number;
  onClear: () => void;
  onExportEmpty?: () => void;
  className?: string;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState("");
  const [frozen, setFrozen] = useState<any[] | null>(null); // snapshot saat dijeda
  const [stick, setStick] = useState(true); // otomatis ikut komentar terbaru
  const [seen, setSeen] = useState(0); // jumlah komentar yang sudah terlihat saat pengguna menggulir ke atas

  const paused = frozen !== null;
  const source = frozen ?? comments;
  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () => (q ? source.filter((c) => `${c.user} ${c.text}`.toLowerCase().includes(q)) : source),
    [source, q],
  );
  const shown = filtered.slice(-VISIBLE);
  const missed = paused ? comments.length - (frozen?.length ?? 0) : 0;
  const unseen = !stick && !paused ? Math.max(0, source.length - seen) : 0;

  // Ikuti komentar terbaru selama pengguna berada di bawah.
  useEffect(() => {
    const el = listRef.current;
    if (el && stick && !paused) el.scrollTop = el.scrollHeight;
  }, [shown.length, stick, paused, q]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    setStick(atBottom);
    if (atBottom) setSeen(source.length);
  };

  const jumpToLatest = () => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setStick(true);
    setSeen(source.length);
  };

  const exportCSV = () => {
    if (!comments.length) return onExportEmpty?.();
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = comments.map((c: any, i: number) =>
      [i + 1, c.ts ? new Date(c.ts).toISOString() : "", esc(c.user), esc(c.text), esc(c.avatar)].join(","),
    );
    const csv = ["No,Waktu,Username,Komentar,Avatar URL", ...rows].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `komentar_tiktok_${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const btn =
    "flex items-center gap-1.5 rounded-lg border border-line bg-white/5 px-2.5 py-1.5 text-xs transition hover:bg-white/10 disabled:opacity-50";

  return (
    <section className={`flex flex-col overflow-hidden rounded-2xl border border-line bg-surface backdrop-blur-md ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h3 className="flex items-center gap-2 font-semibold">
          <FaComment aria-hidden className="h-4 w-4 text-violet-300" />
          Komentar
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-normal tabular-nums text-muted" title="Total diterima">
            {(total ?? comments.length).toLocaleString("id-ID")}
          </span>
        </h3>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setFrozen(paused ? null : [...comments])}
            aria-pressed={paused}
            title={paused ? "Lanjutkan" : "Jeda agar mudah dibaca"}
            className={`${btn} ${paused ? "border-amber-400/50 bg-amber-400/15 text-amber-200" : ""}`}
          >
            {paused ? <FaPlay aria-hidden className="h-3 w-3" /> : <FaPause aria-hidden className="h-3 w-3" />}
            <span className="hidden sm:inline">{paused ? "Lanjut" : "Jeda"}</span>
          </button>
          <button type="button" onClick={exportCSV} title="Unduh CSV" className={btn}>
            <FaDownload aria-hidden className="h-3 w-3" />
            <span className="hidden sm:inline">CSV</span>
          </button>
          <button type="button" onClick={onClear} disabled={!comments.length} title="Bersihkan daftar" className={btn}>
            <FaTrashCan aria-hidden className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Cari */}
      <div className="border-b border-line px-3 py-2">
        <label className="relative block">
          <span className="sr-only">Cari komentar atau username</span>
          <FaMagnifyingGlass aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari komentar atau @username"
            className="w-full rounded-lg border border-line bg-black/20 py-1.5 pl-8 pr-8 text-xs placeholder:text-muted/60 focus:border-accent-2"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Hapus pencarian"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-white"
            >
              <FaXmark aria-hidden className="h-3 w-3" />
            </button>
          )}
        </label>
        {q && (
          <p className="mt-1 text-[11px] text-muted">
            {filtered.length.toLocaleString("id-ID")} cocok dari {source.length.toLocaleString("id-ID")}
          </p>
        )}
      </div>

      {/* Daftar: terlama di atas, terbaru di bawah (seperti chat) */}
      <div className="relative min-h-0 flex-1">
        <ul
          ref={listRef}
          onScroll={onScroll}
          aria-live={paused ? "off" : "polite"}
          className="scrollbar-thin h-full space-y-0.5 overflow-y-auto px-2 py-2 text-sm"
        >
          {shown.length ? (
            shown.map((c: any) => (
              <li key={c.id ?? `${c.ts}-${c.user}-${c.text}`} className="flex items-start gap-2.5 rounded-xl px-2 py-1.5 transition hover:bg-white/5">
                <a href={`https://www.tiktok.com/@${c.user}`} target="_blank" rel="noopener noreferrer" className="shrink-0">
                  <Avatar name={c.user} src={c.avatar} />
                </a>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <a
                      href={`https://www.tiktok.com/@${c.user}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-xs font-semibold hover:underline"
                      style={{ color: colorOf(c.user) }}
                    >
                      @{c.user}
                    </a>
                    <span className="shrink-0 text-[10px] tabular-nums text-muted/70">{time(c.ts)}</span>
                  </div>
                  <p className="break-words leading-snug text-gray-100">{c.text}</p>
                </div>
              </li>
            ))
          ) : (
            <li className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted">
              <FaComment aria-hidden className="h-6 w-6 opacity-40" />
              {q ? "Tidak ada komentar yang cocok." : "Menunggu komentar masuk…"}
            </li>
          )}
        </ul>

        {/* Tombol lompat ke terbaru */}
        {!stick && !paused && shown.length > 0 && (
          <button
            type="button"
            onClick={jumpToLatest}
            className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold shadow-lg transition hover:brightness-110"
          >
            <FaArrowDown aria-hidden className="h-3 w-3" />
            {unseen > 0 ? `${unseen.toLocaleString("id-ID")} komentar baru` : "Ke terbaru"}
          </button>
        )}

        {/* Info saat dijeda */}
        {paused && (
          <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2 rounded-xl border border-amber-400/40 bg-amber-950/80 px-3 py-2 text-xs text-amber-100 backdrop-blur">
            <span>Dijeda{missed > 0 ? ` · ${missed.toLocaleString("id-ID")} komentar baru menunggu` : ""}</span>
            <button type="button" onClick={() => setFrozen(null)} className="rounded-md bg-amber-400/20 px-2 py-1 font-semibold hover:bg-amber-400/30">
              Lanjutkan
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
