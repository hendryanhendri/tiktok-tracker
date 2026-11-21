"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FaPlay, FaTowerBroadcast, FaVideo, FaBook, FaBagShopping } from "react-icons/fa6";

const links = [
  { name: "Live Player", icon: FaTowerBroadcast, href: "/" },
  { name: "Video Saja", icon: FaVideo, href: "/video" },
  { name: "Shopee Live", icon: FaBagShopping, href: "/shopee" },
  { name: "Dokumentasi", icon: FaBook, href: "/doc" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line bg-background/70 backdrop-blur-xl">
      <nav aria-label="Navigasi utama" className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-purple-600 shadow-lg shadow-accent/20">
            <FaPlay className="h-3.5 w-3.5 text-white" />
          </span>
          <span className="hidden text-base font-semibold tracking-tight sm:inline sm:text-lg">
            TikTok <span className="text-accent-2">Live Player</span>
          </span>
        </Link>

        <ul className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1">
          {links.map(({ name, icon: Icon, href }) => {
            const active = pathname === href;
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition ${
                    active ? "bg-white/15 font-medium text-white" : "text-muted hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" />
                  {/* Layar kecil: hanya menu aktif yang menampilkan nama, sisanya ikon saja agar tidak berdesakan */}
                  <span className={`whitespace-nowrap ${active ? "" : "hidden sm:inline"}`}>{name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
