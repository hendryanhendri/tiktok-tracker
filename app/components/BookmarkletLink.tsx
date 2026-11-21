"use client";
import { useEffect, useRef } from "react";
import { FaBookmark, FaArrowUp } from "react-icons/fa6";
import { bookmarkletHref } from "@/app/lib/streams";

/**
 * Tombol bookmarklet yang diseret ke bookmark bar. React memblokir href "javascript:" di JSX, jadi href dipasang lewat ref.
 * appPath: halaman aplikasi tujuan bila bookmark harus membuka tab baru (bawaan "/").
 */
export default function BookmarkletLink({ onBlocked, appPath = "", label = "🎬 TikTok Live" }: { onBlocked: () => void; appPath?: string; label?: string }) {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    ref.current?.setAttribute("href", bookmarkletHref(window.location.origin, appPath));
  }, [appPath]);
  return (
    <a
      ref={ref}
      draggable
      title="Klik dan tahan, lalu lepas di bookmark bar"
      onClick={(e) => {
        e.preventDefault();
        onBlocked();
      }}
      className="nudge-up inline-flex cursor-grab items-center gap-2 rounded-xl border border-dashed border-accent bg-gradient-to-r from-accent/20 to-accent-2/15 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-accent/10 transition hover:brightness-125 hover:animate-none active:animate-none active:cursor-grabbing"
    >
      <FaBookmark aria-hidden className="h-3.5 w-3.5 text-accent" /> {label}
      <FaArrowUp aria-hidden className="h-3 w-3 text-accent-2" />
    </a>
  );
}
