@echo off
setlocal EnableDelayedExpansion
title TikTok Live Tracker
cd /d "%~dp0"

set "NODE_VER=22.12.0"
set "RUNTIME=%~dp0.runtime"
set "NODE_DIR=%RUNTIME%\node-v%NODE_VER%-win-x64"

echo ==============================================
echo   TikTok Live Tracker - satu klik jalan
echo ==============================================
echo.

rem --- 1. Cari Node.js: pakai yang terpasang, kalau tidak ada download versi portable ---
where node >nul 2>nul
if %errorlevel%==0 (
  echo [OK] Node.js terdeteksi di sistem.
) else (
  if not exist "%NODE_DIR%\node.exe" (
    echo [..] Node.js belum ada. Mengunduh versi portable ^(sekali saja, ~30MB^)...
    if not exist "%RUNTIME%" mkdir "%RUNTIME%"
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol='Tls12'; Invoke-WebRequest 'https://nodejs.org/dist/v%NODE_VER%/node-v%NODE_VER%-win-x64.zip' -OutFile '%RUNTIME%\node.zip'; Expand-Archive '%RUNTIME%\node.zip' -DestinationPath '%RUNTIME%' -Force; Remove-Item '%RUNTIME%\node.zip'"
    if not exist "%NODE_DIR%\node.exe" (
      echo [GAGAL] Tidak bisa mengunduh Node.js. Periksa koneksi internet lalu coba lagi.
      pause
      exit /b 1
    )
  )
  set "PATH=%NODE_DIR%;%PATH%"
  echo [OK] Memakai Node.js portable.
)

rem --- 2. Install dependency (hanya pertama kali) ---
if not exist "node_modules\next" (
  echo [..] Memasang dependency ^(pertama kali, beberapa menit^)...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo [GAGAL] npm install gagal.
    pause
    exit /b 1
  )
)

rem --- 3. Build (pertama kali, atau otomatis bila ada file kode lebih baru dari build terakhir) ---
set "NEED_BUILD=0"
if not exist ".next\BUILD_ID" set "NEED_BUILD=1"
if "%NEED_BUILD%"=="0" (
  powershell -NoProfile -Command "$b=(Get-Item '.next\BUILD_ID').LastWriteTime; $n=Get-ChildItem app,server,utils,public -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -gt $b } | Select-Object -First 1; if ($n) { exit 1 } else { exit 0 }"
  if errorlevel 1 set "NEED_BUILD=1"
)
if "%NEED_BUILD%"=="1" (
  echo [..] Membangun aplikasi ^(pertama kali atau setelah update, beberapa menit^)...
  call npm run build
  if errorlevel 1 (
    echo [GAGAL] Build gagal.
    pause
    exit /b 1
  )
)

rem --- 4. Jalankan server + web, lalu buka browser ---
echo [..] Menjalankan aplikasi... jangan tutup jendela ini selama dipakai.
start "" powershell -NoProfile -Command "Start-Sleep -Seconds 6; Start-Process 'http://localhost:3000'"
call npm start

echo.
echo Aplikasi berhenti.
pause
