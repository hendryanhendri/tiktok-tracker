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

rem --- 4. Nama lokal fsn.live.test (opsional): terlihat seperti domain dan tanpa :3000. Hanya di komputer ini (127.0.0.1). ---
set "APP_DOMAIN=fsn.live.test"
set "APP_URL=http://localhost:3000"
set "HAVE_NAME=0"
set "HOSTS=%SystemRoot%\System32\drivers\etc\hosts"
findstr /C:"%APP_DOMAIN%" "%HOSTS%" >nul 2>nul && set "HAVE_NAME=1"
if "%HAVE_NAME%"=="0" if not exist "%RUNTIME%\no-local-domain" (
  echo.
  echo Pasang nama lokal %APP_DOMAIN%? Alamat jadi http://%APP_DOMAIN% ^(tanpa :3000^), hanya terbuka di komputer ini.
  echo Perlu izin Administrator sekali untuk menambah satu baris ke file hosts.
  set "ANS="
  set /p ANS="Pasang sekarang? [Y/n] "
  if /i "!ANS:~0,1!"=="n" (
    if not exist "%RUNTIME%" mkdir "%RUNTIME%"
    type nul > "%RUNTIME%\no-local-domain"
    echo Dilewati. Hapus file .runtime\no-local-domain jika ingin ditanya lagi.
  ) else (
    powershell -NoProfile -Command "Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile','-Command','Add-Content -Path $env:SystemRoot\System32\drivers\etc\hosts -Value ''127.0.0.1 fsn.live.test''; ipconfig /flushdns'"
    findstr /C:"%APP_DOMAIN%" "%HOSTS%" >nul 2>nul && set "HAVE_NAME=1"
    if "!HAVE_NAME!"=="1" (
      echo [OK] Nama %APP_DOMAIN% terpasang.
    ) else (
      echo [!] Tidak bisa mengubah file hosts. Memakai http://localhost:3000.
    )
  )
)
if "%HAVE_NAME%"=="1" (
  rem Port 80 supaya alamat tanpa :3000. Bila port 80 sudah dipakai program lain, tetap pakai :3000.
  netstat -ano | findstr /R /C:":80 .*LISTENING" >nul 2>nul
  if errorlevel 1 (
    set "PORT=80"
    set "APP_URL=http://%APP_DOMAIN%"
  ) else (
    set "APP_URL=http://%APP_DOMAIN%:3000"
  )
)

rem --- 5. Jalankan server + web, lalu buka browser ---
echo [..] Menjalankan aplikasi... jangan tutup jendela ini selama dipakai.
echo      Alamat: %APP_URL%
start "" powershell -NoProfile -Command "Start-Sleep -Seconds 6; Start-Process '%APP_URL%'"
call npm start

echo.
echo Aplikasi berhenti.
pause
