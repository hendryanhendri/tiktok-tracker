import Image from "next/image";

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-line px-4 py-8 text-center text-xs text-muted">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4">
        <div className="flex items-center gap-3">
          {/* Logo berlatar putih: dibungkus tile agar rapi di tema gelap */}
          <Image
            src="/logo/fsn-mark.png"
            alt="Logo FullStackNotes"
            width={40}
            height={40}
            className="rounded-xl bg-white shadow-lg shadow-black/30"
          />
          <p className="text-left leading-tight">
            <span className="block text-[10px] uppercase tracking-wider text-muted/70">Dikembangkan oleh</span>
            <span className="text-sm font-semibold text-white">FullStackNotes</span>
          </p>
        </div>

        <p className="max-w-md text-[11px] leading-relaxed text-muted/80">
          Tidak berafiliasi dengan TikTok. Untuk penggunaan pribadi.
        </p>
        <p>© {new Date().getFullYear()} FullStackNotes</p>
      </div>
    </footer>
  );
}
