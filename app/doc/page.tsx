import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Dokumentasi | TikTok Live Player",
  description: "Kapan perlu bookmark, kapan tidak, dan apa yang dibutuhkan untuk live privat atau 18+.",
};

type Row = { jenis: string; bookmark: string; login: string; catatan: string };

const ROWS: Row[] = [
  {
    jenis: "Live publik biasa",
    bookmark: "Tidak perlu",
    login: "Tidak perlu",
    catatan: "Ketik username lalu klik Mulai. Video langsung tampil.",
  },
  {
    jenis: "Live yang URL videonya disembunyikan dari akses anonim",
    bookmark: "Perlu",
    login: "Biasanya tidak",
    catatan: "Muncul kartu \"Menunggu video dari TikTok\". Putar live di tab TikTok, lalu klik bookmark.",
  },
  {
    jenis: "Live dibatasi usia (18+)",
    bookmark: "Perlu",
    login: "Perlu",
    catatan: "Login ke TikTok di browser yang sama. Akun Anda harus boleh menonton live itu.",
  },
  {
    jenis: "Live privat atau khusus pengikut/pelanggan",
    bookmark: "Perlu",
    login: "Perlu",
    catatan: "Hanya bisa jika akun Anda memang diizinkan menontonnya di TikTok.",
  },
  {
    jenis: "Live khusus audio",
    bookmark: "Sesuai kasus",
    login: "Sesuai kasus",
    catatan: "Tidak ada gambar, hanya suara. Itu bukan kerusakan.",
  },
  {
    jenis: "Live sudah berakhir / tidak live",
    bookmark: "Tidak berguna",
    login: "-",
    catatan: "Tidak ada video yang bisa diambil.",
  },
];

const TROUBLE: { gejala: string; solusi: string }[] = [
  { gejala: "Video tertinggal beberapa detik dari live aslinya", solusi: "Normal: siaran live selalu punya jeda bawaan (dari kamera streamer ke server TikTok, lalu ke Anda), dan TikTok sendiri juga tertinggal beberapa detik. Jeda tidak bisa nol. Untuk menguranginya: buka menu ⚙ lalu nyalakan Latensi rendah (bisa lebih mudah tersendat), pilih kualitas lebih rendah, dan klik Ke live bila muncul." },
  { gejala: "Kartu \"Menunggu video\" tidak hilang", solusi: "Pastikan live benar-benar diputar di tab TikTok (bukan hanya terbuka), tunggu beberapa detik, lalu klik bookmark." },
  { gejala: "Muncul \"Bookmark Anda versi lama\"", solusi: "Hapus bookmark lama, lalu pasang ulang dari halaman awal (klik dan tahan tombolnya, lepas di bookmark bar)." },
  { gejala: "Ada suara tetapi tidak ada gambar", solusi: "Live mungkin khusus audio, atau codec videonya tidak didukung browser. Coba kualitas lain di menu ⚙ (mis. 540p)." },
  { gejala: "Video berhenti atau gagal diputar", solusi: "URL video punya masa berlaku. Klik bookmark lagi di tab TikTok." },
  { gejala: "Tab TikTok tidak terbuka", solusi: "Pop-up diblokir browser. Izinkan pop-up untuk situs ini, atau klik tombol Buka di kartu \"Menunggu video\"." },
  { gejala: "Komentar atau gift tidak tersambung", solusi: "Layanan penandatangan kadang membatasi permintaan. Tunggu sebentar lalu coba lagi." },
  { gejala: "Tampilan kosong setelah memuat ulang halaman", solusi: "Memuat ulang (refresh) selalu mengosongkan sesi. Pindah menu aman, refresh tidak." },
];

const tone = (v: string) =>
  v === "Perlu" ? "bg-accent/20 text-white" : v === "Tidak perlu" || v === "Biasanya tidak" ? "bg-emerald-400/15 text-emerald-200" : "bg-white/10 text-muted";

export default function DocPage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-10 px-4 pb-8 pt-6">
      <header className="text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Dokumentasi</h1>
        <p className="mt-2 text-sm text-muted sm:text-base">Kapan perlu bookmark, kapan tidak, dan apa yang dibutuhkan untuk live terbatas.</p>
      </header>

      {/* Aturan inti */}
      <section className="rounded-2xl border border-accent/40 bg-gradient-to-br from-accent/15 to-accent-2/10 p-6">
        <h2 className="text-lg font-semibold">Aturan singkatnya</h2>
        <ul className="mt-3 space-y-2 text-sm text-muted">
          <li>
            <b className="text-white">Komentar dan gift</b> selalu lewat username, tanpa bookmark dan tanpa login TikTok.
          </li>
          <li>
            <b className="text-white">Video</b>: coba username dulu. Kalau videonya tidak muncul, pakai bookmark.
          </li>
          <li>
            Menu <b className="text-white">Video Saja</b> menampilkan hanya video dan suara (tanpa statistik, komentar, atau gift), dengan sesi yang
            sama seperti Live Player. Menu ⚙ di dalamnya sama dengan Live Player (Orientasi, Kualitas, Latensi rendah, Picture-in-picture), ditambah Audio saja.
          </li>
          <li>
            Bookmark berjalan di tab TikTok Anda, jadi <b className="text-white">apa yang bisa Anda tonton di tab itu, itu yang bisa diambilnya</b>.
            Itu sebabnya live privat atau 18+ membutuhkan login.
          </li>
        </ul>
      </section>

      {/* Tabel jenis live */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Jenis live</h2>
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface backdrop-blur-md">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-line bg-white/5 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Jenis live</th>
                <th className="px-4 py-3">Bookmark</th>
                <th className="px-4 py-3">Login TikTok</th>
                <th className="px-4 py-3">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ROWS.map((r) => (
                <tr key={r.jenis} className="align-top">
                  <td className="px-4 py-3 font-medium">{r.jenis}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${tone(r.bookmark)}`}>{r.bookmark}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${tone(r.login)}`}>{r.login}</span>
                  </td>
                  <td className="px-4 py-3 text-muted">{r.catatan}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted/80">
          Perilaku TikTok bisa berbeda untuk tiap streamer dan wilayah, dan bisa berubah sewaktu-waktu. Tabel ini panduan umum, bukan jaminan.
        </p>
      </section>

      {/* Cara memakai */}
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-line bg-surface p-5 backdrop-blur-md">
          <h2 className="font-semibold">Tanpa bookmark</h2>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-muted">
            <li>Ketik username, klik <b className="text-white">Mulai</b>.</li>
            <li>Tab TikTok terbuka sebentar.</li>
            <li>Jika video tersedia dari server, tab itu otomatis ditutup dan video tampil.</li>
          </ol>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-5 backdrop-blur-md">
          <h2 className="font-semibold">Dengan bookmark 🎬</h2>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-muted">
            <li>Pasang sekali: klik dan tahan tombol 🎬 di halaman awal, lepas di bookmark bar.</li>
            <li>Klik <b className="text-white">Mulai</b>. Tab TikTok terbuka.</li>
            <li>Login jika live-nya membutuhkannya, putar live-nya, lalu klik bookmark.</li>
            <li>Video terkirim ke halaman aplikasi.</li>
          </ol>
        </div>
      </section>

      {/* Masalah umum */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Masalah umum</h2>
        <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface backdrop-blur-md">
          {TROUBLE.map((t) => (
            <div key={t.gejala} className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[16rem_1fr] sm:gap-4">
              <p className="font-medium">{t.gejala}</p>
              <p className="text-muted">{t.solusi}</p>
            </div>
          ))}
        </div>
      </section>

      <p className="text-center text-xs text-muted/80">
        Tidak berafiliasi dengan TikTok. Untuk penggunaan pribadi. <Link href="/" className="text-accent-2 hover:underline">Kembali ke Live Player</Link>
      </p>
    </div>
  );
}
