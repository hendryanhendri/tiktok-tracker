/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useMemo, useState } from "react";
import { FaCrown, FaGift } from "react-icons/fa6";
import Avatar, { colorOf } from "@/app/components/Avatar";
import { COIN_RATE_IDR } from "@/utils/giftValue";

type Tab = "feed" | "top" | "jenis";
const TABS: { id: Tab; label: string }[] = [
  { id: "feed", label: "Terbaru" },
  { id: "top", label: "Top Gifter" },
  { id: "jenis", label: "Per Gift" },
];

const nf = (n: number) => n.toLocaleString("id-ID");
const rp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
const time = (ts?: number) => (ts ? new Date(ts).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "");

// Tingkat sorotan berdasarkan nilai koin satu pengiriman.
const tier = (coins: number) => (coins >= 10000 ? 2 : coins >= 1000 ? 1 : 0);

function GiftIcon({ src, className = "h-8 w-8" }: { src?: string | null; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <span className={`flex shrink-0 items-center justify-center rounded-lg bg-amber-400/15 ${className}`}>
        <FaGift aria-hidden className="h-4 w-4 text-amber-300" />
      </span>
    );
  }
  return <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} className={`shrink-0 object-contain ${className}`} />;
}

export default function GiftsPanel({ gifts, className = "h-[22rem]" }: { gifts: any[]; className?: string }) {
  const [tab, setTab] = useState<Tab>("feed");

  const stats = useMemo(() => {
    let count = 0;
    let coins = 0;
    const users = new Map<string, { user: string; avatar?: string; count: number; coins: number }>();
    const kinds = new Map<string, { name: string; icon?: string; count: number; coins: number }>();
    for (const g of gifts) {
      const c = Number(g.count) || 1;
      const k = Number(g.coins) || 0;
      count += c;
      coins += k;
      const u = users.get(g.user) ?? { user: g.user, avatar: g.avatar, count: 0, coins: 0 };
      u.count += c;
      u.coins += k;
      u.avatar ||= g.avatar;
      users.set(g.user, u);
      const t = kinds.get(g.gift) ?? { name: g.gift, icon: g.icon, count: 0, coins: 0 };
      t.count += c;
      t.coins += k;
      t.icon ||= g.icon;
      kinds.set(g.gift, t);
    }
    const byValue = <T extends { coins: number; count: number }>(a: T, b: T) => b.coins - a.coins || b.count - a.count;
    return {
      count,
      coins,
      users: [...users.values()].sort(byValue),
      kinds: [...kinds.values()].sort(byValue),
    };
  }, [gifts]);

  const hasCoins = stats.coins > 0;
  const feed = useMemo(() => [...gifts].reverse().slice(0, 100), [gifts]);
  const maxUser = Math.max(1, ...stats.users.slice(0, 10).map((u) => (hasCoins ? u.coins : u.count)));
  const maxKind = Math.max(1, ...stats.kinds.map((k) => (hasCoins ? k.coins : k.count)));

  const summary = [
    { label: "Gift", value: nf(stats.count) },
    { label: "Koin", value: hasCoins ? nf(stats.coins) : "—" },
    { label: "Estimasi", value: hasCoins ? rp(stats.coins * COIN_RATE_IDR) : "—" },
  ];

  return (
    <section className={`flex flex-col overflow-hidden rounded-2xl border border-line bg-surface backdrop-blur-md ${className}`}>
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h3 className="flex items-center gap-2 font-semibold">
          <FaGift aria-hidden className="h-4 w-4 text-amber-300" />
          Gift
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-normal tabular-nums text-muted">{nf(gifts.length)}</span>
        </h3>
        <div role="tablist" aria-label="Tampilan gift" className="flex gap-0.5 rounded-lg border border-line bg-black/20 p-0.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-md px-2.5 py-1 text-xs transition ${tab === t.id ? "bg-white/15 font-medium text-white" : "text-muted hover:text-white"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Ringkasan */}
      <div className="grid grid-cols-3 gap-px border-b border-line bg-line">
        {summary.map((s) => (
          <div key={s.label} className="bg-background/60 px-3 py-2 text-center">
            <p className="text-[10px] uppercase tracking-wide text-muted">{s.label}</p>
            <p className="truncate text-sm font-semibold tabular-nums" title={s.value}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-2 text-sm">
        {!gifts.length ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-muted">
            <FaGift aria-hidden className="h-6 w-6 opacity-40" />
            Belum ada gift. Gift yang masuk akan tampil di sini.
          </div>
        ) : tab === "feed" ? (
          <ul aria-live="polite" className="space-y-1">
            {feed.map((g: any) => {
              const t = tier(Number(g.coins) || 0);
              return (
                <li
                  key={g.id ?? `${g.ts}-${g.user}-${g.gift}`}
                  className={`pop-in flex items-center gap-2.5 rounded-xl px-2.5 py-2 ${
                    t === 2
                      ? "border border-amber-300/60 bg-gradient-to-r from-amber-400/25 to-accent/20"
                      : t === 1
                        ? "border border-amber-400/30 bg-amber-400/10"
                        : "hover:bg-white/5"
                  }`}
                >
                  <GiftIcon src={g.icon} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate leading-tight">
                      <a href={`https://www.tiktok.com/@${g.user}`} target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline" style={{ color: colorOf(g.user) }}>
                        @{g.user}
                      </a>
                      <span className="text-muted"> mengirim </span>
                      <span className="font-medium text-white">{g.gift}</span>
                    </p>
                    <p className="text-[10px] tabular-nums text-muted/80">
                      {time(g.ts)}
                      {Number(g.coins) > 0 && ` · ${nf(g.coins)} koin`}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-amber-400/20 px-2 py-0.5 text-xs font-bold text-amber-300">×{nf(Number(g.count) || 1)}</span>
                </li>
              );
            })}
          </ul>
        ) : tab === "top" ? (
          <ol className="space-y-1.5">
            {stats.users.slice(0, 10).map((u, i) => {
              const v = hasCoins ? u.coins : u.count;
              return (
                <li key={u.user} className="rounded-xl px-2.5 py-2 hover:bg-white/5">
                  <div className="flex items-center gap-2.5">
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${i === 0 ? "bg-amber-400 text-black" : i === 1 ? "bg-gray-300 text-black" : i === 2 ? "bg-orange-400 text-black" : "bg-white/10 text-muted"}`}>
                      {i === 0 ? <FaCrown aria-hidden className="h-2.5 w-2.5" /> : i + 1}
                    </span>
                    <Avatar name={u.user} src={u.avatar} size={28} />
                    <a href={`https://www.tiktok.com/@${u.user}`} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate font-semibold hover:underline">
                      @{u.user}
                    </a>
                    <div className="shrink-0 text-right text-xs tabular-nums">
                      <p className="font-semibold text-amber-300">{hasCoins ? `${nf(u.coins)} koin` : `${nf(u.count)} gift`}</p>
                      {hasCoins && <p className="text-[10px] text-muted">{nf(u.count)} gift</p>}
                    </div>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-accent" style={{ width: `${(v / maxUser) * 100}%` }} />
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <ul className="space-y-1.5">
            {stats.kinds.map((k) => {
              const v = hasCoins ? k.coins : k.count;
              return (
                <li key={k.name} className="rounded-xl px-2.5 py-2 hover:bg-white/5">
                  <div className="flex items-center gap-2.5">
                    <GiftIcon src={k.icon} className="h-7 w-7" />
                    <span className="min-w-0 flex-1 truncate font-medium">{k.name}</span>
                    <div className="shrink-0 text-right text-xs tabular-nums">
                      <p className="font-semibold text-amber-300">×{nf(k.count)}</p>
                      {hasCoins && <p className="text-[10px] text-muted">{nf(k.coins)} koin</p>}
                    </div>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-accent" style={{ width: `${(v / maxKind) * 100}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {hasCoins && (
        <p className="border-t border-line px-3 py-1.5 text-center text-[10px] text-muted">
          Estimasi kasar: 1 koin ≈ {rp(COIN_RATE_IDR)}. Bukan pendapatan bersih streamer.
        </p>
      )}
    </section>
  );
}
