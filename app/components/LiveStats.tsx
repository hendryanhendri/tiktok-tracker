"use client";
import { motion } from "framer-motion";
import { FaEye, FaChartLine, FaGift, FaComment, FaStop } from "react-icons/fa6";

const fmt = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : n.toLocaleString("id-ID");

const STATUS: Record<string, { label: string; dot: string; text: string }> = {
  connected: { label: "Terhubung", dot: "bg-emerald-400", text: "text-emerald-300" },
  connecting: { label: "Menghubungkan…", dot: "bg-sky-400 animate-pulse", text: "text-sky-300" },
  ended: { label: "Live berakhir", dot: "bg-gray-400", text: "text-gray-300" },
  error: { label: "Error koneksi", dot: "bg-rose-400", text: "text-rose-300" },
  disconnected: { label: "Terputus", dot: "bg-amber-400", text: "text-amber-300" },
  offline: { label: "Offline", dot: "bg-gray-400", text: "text-gray-300" },
};

export function StatusPill({ status }: { status: string }) {
  const s = STATUS[status.toLowerCase()] ?? STATUS.offline;
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium ${s.text}`}>
      <span className={`h-2 w-2 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

type Props = {
  username: string;
  status: string;
  viewerCount: number | null;
  totalViews: number;
  gifts: number;
  comments: number;
  title?: string | null;
  onClose?: () => void;
};

/** Bilah ringkas satu baris (nama, status, judul, statistik, tombol Tutup) agar video dan chat muat dalam satu layar. */
export default function LiveStats({ username, status, viewerCount, totalViews, gifts, comments, title, onClose }: Props) {
  const items = [
    { label: "Viewers", value: fmt(viewerCount), icon: FaEye, color: "text-accent" },
    { label: "Total Views", value: fmt(totalViews), icon: FaChartLine, color: "text-accent-2" },
    { label: "Gifts", value: fmt(gifts), icon: FaGift, color: "text-amber-300" },
    { label: "Komentar", value: fmt(comments), icon: FaComment, color: "text-violet-300" },
  ];

  return (
    <motion.section
      aria-label="Statistik live"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-line bg-surface px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <h2 className="truncate text-lg font-semibold">@{username || "—"}</h2>
          <StatusPill status={status} />
        </div>
        {title && (
          <p className="hidden min-w-0 flex-1 truncate text-sm text-muted xl:block" title={title}>
            {title}
          </p>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {items.map(({ label, value, icon: Icon, color }) => (
            <div key={label} title={label} className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-1.5">
              <Icon aria-hidden className={`h-3.5 w-3.5 ${color}`} />
              <span className="hidden text-xs text-muted sm:inline">{label}</span>
              <span className="font-semibold tabular-nums">{value}</span>
            </div>
          ))}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold transition hover:bg-rose-500"
          >
            <FaStop aria-hidden className="h-3 w-3" /> Tutup
          </button>
        )}
      </div>
    </motion.section>
  );
}
