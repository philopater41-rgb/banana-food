@echo off
title Day ^& Night POS Launcher
cd /d "%~dp0"

echo ====================================================
echo      Day ^& Night POS - Starting Application
echo ====================================================
echo.

:: 1. Stop any old running node servers to prevent port 3000 conflicts
echo [+] Cleaning up previous server instances...
taskkill /f /im node.exe >nul 2>&1

:: 2. Launch server in a minimized background window using direct node binary
echo [+] Starting POS Server...
start "" /min node "node_modules\next\dist\bin\next" start

:: 3. Wait for Next.js server to start up
echo [+] Waiting for server to initialize...
timeout /t 5 /nobreak >nul

:: 4. Open POS in Kiosk Printing mode with dedicated profile (guarantees silent instant printing without preview dialog)
echo [+] Opening POS application window with Silent Thermal Printing...
start msedge --kiosk-printing --user-data-dir="%LOCALAPPDATA%\DayNightPOS\edge-pos-profile" --app=http://localhost:3000 2>nul || start chrome --kiosk-printing --user-data-dir="%LOCALAPPDATA%\DayNightPOS\chrome-pos-profile" --app=http://localhost:3000 2>nul || start http://localhost:3000

exit
