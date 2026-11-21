#!/bin/bash
# TikTok Live Tracker - satu klik jalan di macOS
cd "$(dirname "$0")" || exit 1
xattr -dr com.apple.quarantine . 2>/dev/null  # bersihkan tanda karantina macOS untuk file lain

NODE_VER="22.12.0"
RUNTIME="$PWD/.runtime"

echo "=============================================="
echo "  TikTok Live Tracker - satu klik jalan"
echo "=============================================="
echo

fail() { echo "[GAGAL] $1"; read -r -p "Tekan Enter untuk menutup..."; exit 1; }

# 1. Cari Node.js: pakai yang terpasang, kalau tidak ada download versi portable
if command -v node >/dev/null 2>&1; then
  echo "[OK] Node.js terdeteksi di sistem."
else
  case "$(uname -m)" in
    arm64) ARCH="arm64" ;;
    *)     ARCH="x64" ;;
  esac
  NODE_DIR="$RUNTIME/node-v$NODE_VER-darwin-$ARCH"
  if [ ! -x "$NODE_DIR/bin/node" ]; then
    echo "[..] Node.js belum ada. Mengunduh versi portable (sekali saja, ~40MB)..."
    mkdir -p "$RUNTIME"
    curl -fL "https://nodejs.org/dist/v$NODE_VER/node-v$NODE_VER-darwin-$ARCH.tar.gz" | tar -xz -C "$RUNTIME" \
      || fail "Tidak bisa mengunduh Node.js. Periksa koneksi internet lalu coba lagi."
  fi
  export PATH="$NODE_DIR/bin:$PATH"
  echo "[OK] Memakai Node.js portable."
fi

# 2. Install dependency (hanya pertama kali)
if [ ! -d node_modules/next ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  echo "[..] Memasang dependency (pertama kali, beberapa menit)..."
  npm install --no-audit --no-fund || fail "npm install gagal."
fi

# 3. Build (pertama kali, atau otomatis bila ada file kode lebih baru dari build terakhir)
NEED_BUILD=0
[ ! -f .next/BUILD_ID ] && NEED_BUILD=1
if [ "$NEED_BUILD" = 0 ] && [ -n "$(find app server utils public package.json next.config.ts -type f -newer .next/BUILD_ID 2>/dev/null | head -n 1)" ]; then
  NEED_BUILD=1
fi
if [ "$NEED_BUILD" = 1 ]; then
  echo "[..] Membangun aplikasi (pertama kali atau setelah update, beberapa menit)..."
  npm run build || fail "Build gagal."
fi

# 4. Nama lokal fsn.live.test (opsional): terlihat seperti domain dan tanpa :3000.
#    Hanya berlaku di komputer ini (diarahkan ke 127.0.0.1), tidak dibuka ke internet.
APP_DOMAIN="fsn.live.test"
APP_URL="http://localhost:3000"
HAVE_NAME=0
if grep -qE "^[[:space:]]*127\.0\.0\.1[[:space:]]+.*\b$APP_DOMAIN\b" /etc/hosts 2>/dev/null; then
  HAVE_NAME=1
elif [ ! -f "$RUNTIME/no-local-domain" ]; then
  echo
  echo "Pasang nama lokal $APP_DOMAIN? Alamat jadi http://$APP_DOMAIN (tanpa :3000), hanya terbuka di komputer ini."
  echo "Perlu password Mac sekali untuk menambah satu baris ke /etc/hosts."
  read -r -p "Pasang sekarang? [Y/n] " ANS
  case "$ANS" in
    [nN]*)
      mkdir -p "$RUNTIME" && touch "$RUNTIME/no-local-domain"
      echo "Dilewati. Hapus file .runtime/no-local-domain jika ingin ditanya lagi." ;;
    *)
      if echo "127.0.0.1 $APP_DOMAIN" | sudo tee -a /etc/hosts >/dev/null; then
        sudo dscacheutil -flushcache 2>/dev/null; sudo killall -HUP mDNSResponder 2>/dev/null
        HAVE_NAME=1
        echo "[OK] Nama $APP_DOMAIN terpasang."
      else
        echo "[!] Tidak bisa mengubah /etc/hosts. Memakai http://localhost:3000."
      fi ;;
  esac
fi
if [ "$HAVE_NAME" = 1 ]; then
  # Port 80 supaya alamat tanpa :3000. Bila port 80 sudah dipakai program lain, tetap pakai :3000.
  if lsof -iTCP:80 -sTCP:LISTEN >/dev/null 2>&1; then
    APP_URL="http://$APP_DOMAIN:3000"
  else
    export PORT=80
    APP_URL="http://$APP_DOMAIN"
  fi
fi

# 5. Jalankan server + web, lalu buka browser
echo "[..] Menjalankan aplikasi... jangan tutup jendela ini selama dipakai."
echo "     Alamat: $APP_URL"
(sleep 6 && open "$APP_URL") &
npm start

echo
read -r -p "Aplikasi berhenti. Tekan Enter untuk menutup..."
