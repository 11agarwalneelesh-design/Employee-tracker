@echo off
title Operational Tracker Master Autostart
cls

echo ============================================================
echo   🚀 STARTING ALL WORKSPACE SERVICES (BACKGROUND MODE)
echo ============================================================

:: 1. CHECK & START NGROK TUNNEL IF NOT RUNNING
tasklist /FI "IMAGENAME eq ngrok.exe" 2>NUL | find /I /N "ngrok.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo 🌐 [SKIPPED] Ngrok tunnel is already active and running.
) else (
    echo 🌐 [STARTING] Launching permanent Ngrok proxy tunnel...
    start /min "" ngrok http 4000 --url=chemicals-banshee-diving.ngrok-free.dev
    timeout /t 2 >nul
)

:: 2. START THE BACKEND SERVER (TRACKER-BACKEND)
echo 💾 [STARTING] Initializing SQLite database backend...
start /min "" /d "C:\employee-tracker\tracker-backend" node server.js
timeout /t 2 >nul

:: 3. START THE FRONTEND DASHBOARD (TRACKER-FRONTEND)
echo ▲ [STARTING] Launching Next.js UI Dev server...
start /min "" /d "C:\employee-tracker\tracker-frontend" npm run dev

:: 4. WAIT FOR COMPILATION & AUTO-OPEN BROWSER
echo 🕒 Waiting 5 seconds for Next.js initialization components...
timeout /t 5 >nul

echo 🖥️ Opening Operations Board in default browser...
start http://localhost:3000

echo ============================================================
echo   ✅ SUCCESS: All services are running in the background!
echo ============================================================
timeout /t 3
exit