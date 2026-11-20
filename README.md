# TikTok Live Player

Tonton live TikTok dengan pilihan kualitas (rendah → tinggi), mode audio, tampilan mobile/lebar, fullscreen,
Picture-in-Picture, plus komentar, gift, dan viewer. Frontend Next.js + backend Node kecil. Tanpa Python.

## Menjalankan di Windows (satu klik)

Download/clone project, lalu **klik dua kali `Start-Tracker.bat`**. Pertama kali, skrip otomatis
mengunduh Node.js portable (jika belum terpasang), memasang dependency, dan build — butuh internet
dan beberapa menit. Setelah itu browser terbuka ke `http://localhost:3000`. Run berikutnya langsung cepat.

### macOS

Klik dua kali **`Start-Tracker.command`** (langkahnya sama). Jika macOS memblokir karena file hasil download,
klik kanan file → **Open** → **Open** (cukup sekali), atau jalankan `xattr -dr com.apple.quarantine .` di folder project.

## Menjalankan (manual)

```bash
npm install
npm run dev:all                  # pengembangan: backend :8000/:8001 + Next.js :3000
npm run build && npm run start   # produksi lokal: keduanya sekaligus
```

Buka `http://localhost:3000`, isi username yang **sedang live**, klik **Track Live**.

## Cara kerja

- **Video**: URL stream diambil dari API data room TikTok (tanpa penandatangan/Euler). Pemutar mencoba URL langsung,
  lalu otomatis lewat `/proxy` bila ditolak.
- **Komentar, gift, viewer**: koneksi WebSocket TikTok lewat [`tiktok-live-connector`](https://github.com/zerodytrash/TikTok-Live-Connector).
  Ini butuh **penandatangan (Euler)**. Tanpa API key memakai kuota gratis yang terbatas. Kalau komentar/gift gagal
  tersambung, video tetap diputar.
- **Video (disarankan, lewat bookmark 🎬)**: ketik username → klik **Mulai** → tab TikTok terbuka otomatis dan komentar/gift langsung
  tersambung. Di tab TikTok, putar live-nya lalu klik bookmark 🎬: video dikirim balik ke halaman aplikasi (lewat `postMessage`;
  bila tab dibuka manual, aplikasi dibuka di tab baru). Bookmark dipasang sekali (klik dan tahan tombolnya, lalu lepas di bookmark bar); panduannya ada di aplikasi.

## Konfigurasi

Salin ke `.env` (sudah di-`.gitignore`, jangan di-commit):

```
TIKTOK_SIGN_API_KEY=euler_xxxxxxxx    # opsional
```

| Variabel | Default | Keterangan |
|---|---|---|
| `TIKTOK_SIGN_API_KEY` | – | API key Euler Stream (opsional) |
| `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL` | `http://localhost:8000` / `ws://localhost:8001` | URL backend untuk frontend |
| `API_PORT` / `WS_PORT` | `8000` / `8001` | Port backend |
| `HOST` | `127.0.0.1` | Backend tanpa autentikasi: jangan dibuka ke jaringan |
| `ALLOWED_ORIGIN` | `http://localhost:3000` | Origin yang diizinkan CORS |

## Catatan

- URL video punya masa berlaku; kalau gagal, track ulang atau pakai bookmarklet lagi.
- Ringkasan gift (jumlah, koin, estimasi Rupiah, peringkat gifter) dihitung dari gift yang diterima **sejak Track dimulai**.
- Fitur lama "cari di Live Explore" belum dibawa ke versi ini.

## Kapan perlu bookmark / login

Dokumentasi lengkap ada di halaman **Dokumentasi** (`/doc`) di aplikasi. Ringkasnya:

| Jenis live | Bookmark | Login TikTok |
|---|---|---|
| Publik biasa | Tidak | Tidak |
| URL video disembunyikan dari akses anonim | Ya | Biasanya tidak |
| Dibatasi usia (18+) | Ya | Ya |
| Privat / khusus pengikut | Ya | Ya |

Komentar dan gift selalu lewat username (tanpa bookmark, tanpa login TikTok). Bookmark berjalan di tab TikTok Anda, jadi yang bisa
ditonton di tab itu adalah yang bisa diambilnya.
