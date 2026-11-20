"use client";
import { motion } from "framer-motion";
import { FaEye, FaChartLine, FaGift, FaComment } from "react-icons/fa6";

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
};

export default function LiveStats({ username, status, viewerCount, totalViews, gifts, comments }: Props) {
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">@{username || "—"}</h2>
        <StatusPill status={status} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {items.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-2xl border border-line bg-surface p-4 backdrop-blur-md">
            <div className="flex items-center gap-2 text-xs text-muted">
              <Icon aria-hidden className={`h-3.5 w-3.5 ${color}`} />
              {label}
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
    </motion.section>
  );
}
