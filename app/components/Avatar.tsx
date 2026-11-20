/* eslint-disable @next/next/no-img-element */
"use client";
import { useState } from "react";

// Warna avatar cadangan yang konsisten per username.
const PALETTE = ["#fe2c55", "#25f4ee", "#a78bfa", "#f59e0b", "#34d399", "#60a5fa", "#f472b6", "#fb923c"];
export const colorOf = (name: string) => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

export default function Avatar({ name, src, size = 32 }: { name: string; src?: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size };
  if (!src || broken) {
    return (
      <span
        aria-hidden
        className="flex shrink-0 items-center justify-center rounded-full text-xs font-bold text-black/80"
        style={{ ...style, background: colorOf(name) }}
      >
        {(name.replace(/^@/, "")[0] ?? "?").toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      style={style}
      className="shrink-0 rounded-full border border-line bg-white/10 object-cover"
    />
  );
}
