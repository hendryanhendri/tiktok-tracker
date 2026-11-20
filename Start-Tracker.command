#!/bin/bash
# TikTok Live Tracker - satu klik jalan di macOS
cd "$(dirname "$0")" || exit 1

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
if [ ! -d node_modules/next ]; then
  echo "[..] Memasang dependency (pertama kali, beberapa menit)..."
  npm install --no-audit --no-fund || fail "npm install gagal."
fi

# 3. Build (hanya pertama kali / setelah update)
if [ ! -f .next/BUILD_ID ]; then
  echo "[..] Membangun aplikasi (pertama kali, beberapa menit)..."
  npm run build || fail "Build gagal."
fi

# 4. Jalankan server + web, lalu buka browser
echo "[..] Menjalankan aplikasi... jangan tutup jendela ini selama dipakai."
(sleep 6 && open "http://localhost:3000") &
npm start

echo
read -r -p "Aplikasi berhenti. Tekan Enter untuk menutup..."
