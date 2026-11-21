/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useEffect, useState } from "react";
import { FaComment, FaGift } from "react-icons/fa6";
import CommentsPanel from "@/app/components/CommentsPanel";
import GiftsPanel from "@/app/components/GiftsPanel";

type Tab = "comments" | "gifts";

const nf = (n: number) => n.toLocaleString("id-ID");

/**
 * Komentar dan Gift dalam satu panel bertab, setinggi layar (tanpa scroll halaman di desktop).
 * Kedua panel tetap terpasang (hanya disembunyikan) agar pencarian, jeda, dan posisi gulir tidak hilang saat pindah tab.
 */
export default function SidePanels({
  comments,
  commentTotal,
  gifts,
  onClearComments,
  onExportEmpty,
}: {
  comments: any[];
  commentTotal: number;
  gifts: any[];
  onClearComments: () => void;
  onExportEmpty?: () => void;
}) {
  const [tab, setTab] = useState<Tab>("comments");
  // Jumlah yang sudah dilihat per tab, untuk lencana "baru" di tab yang sedang tidak aktif.
  const [seen, setSeen] = useState({ comments: 0, gifts: 0 });
  useEffect(() => {
    setSeen((s) => (tab === "comments" ? { ...s, comments: commentTotal } : { ...s, gifts: gifts.length }));
  }, [tab, commentTotal, gifts.length]);

  const tabs: { id: Tab; label: string; icon: typeof FaComment; count: number; fresh: number; tone: string }[] = [
    { id: "comments", label: "Komentar", icon: FaComment, count: commentTotal, fresh: Math.max(0, commentTotal - seen.comments), tone: "text-violet-300" },
    { id: "gifts", label: "Gift", icon: FaGift, count: gifts.length, fresh: Math.max(0, gifts.length - seen.gifts), tone: "text-amber-300" },
  ];

  return (
    // Desktop: mengisi kolom persis setinggi kartu video di sebelahnya (absolute inset-0 agar tidak ikut menentukan tinggi baris).
    <div className="flex min-w-0 flex-col gap-3 lg:absolute lg:inset-0">
      <div role="tablist" aria-label="Komentar dan gift" className="grid grid-cols-2 gap-1 rounded-2xl border border-line bg-surface p-1">
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm transition ${
                active ? "bg-white/15 font-semibold text-white" : "text-muted hover:bg-white/5 hover:text-white"
              }`}
            >
              <t.icon aria-hidden className={`h-3.5 w-3.5 ${t.tone}`} />
              {t.label}
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-normal tabular-nums text-muted">{nf(t.count)}</span>
              {!active && t.fresh > 0 && (
                <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold leading-none text-white" title={`${nf(t.fresh)} baru`}>
                  +{t.fresh > 99 ? "99" : t.fresh}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="h-[32rem] min-h-[20rem] lg:h-auto lg:min-h-0 lg:flex-1">
        <div role="tabpanel" hidden={tab !== "comments"} className="h-full">
          <CommentsPanel comments={comments} total={commentTotal} onClear={onClearComments} onExportEmpty={onExportEmpty} visible={tab === "comments"} className="h-full" />
        </div>
        <div role="tabpanel" hidden={tab !== "gifts"} className="h-full">
          <GiftsPanel gifts={gifts} className="h-full" />
        </div>
      </div>
    </div>
  );
}
