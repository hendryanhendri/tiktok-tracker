/** Label level penonton/gifter TikTok ("Lv 23"). Tidak tampil bila level 0 atau tidak diketahui. */
export default function LevelBadge({ level, className = "" }: { level?: number | null; className?: string }) {
  const lv = Number(level) || 0;
  if (lv <= 0) return null;
  const tone = lv >= 40 ? "bg-rose-500" : lv >= 20 ? "bg-violet-500" : "bg-sky-600";
  return (
    <span title={`Level ${lv}`} className={`inline-block shrink-0 rounded px-1 py-px text-[10px] font-bold leading-none text-white ${tone} ${className}`}>
      Lv {lv}
    </span>
  );
}
