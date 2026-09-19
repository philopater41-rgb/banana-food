@echo off
setlocal enabledelayedexpansion
title Banana Food POS Launcher
cd /d "%~dp0"

if exist "C:\Program Files\nodejs" (
    set "PATH=%PATH%;C:\Program Files\nodejs"
)

:: 1. Fast check if server is already running (under 0.05s)
netstat -ano | findstr :3000 | findstr LISTENING >nul 2>&1
if %errorlevel% equ 0 goto launch_ui

:: 2. Start server in background if not running
echo Starting POS Server in background...
wscript.exe "%~dp0scripts\start_server_hidden.vbs"

:: 3. Fast wait loop until port 3000 is ready
set count=0
:wait_loop
set /a count+=1
timeout /t 1 /nobreak >nul
netstat -ano | findstr :3000 | findstr LISTENING >nul 2>&1
if %errorlevel% equ 0 goto launch_ui
if !count! lss 8 goto wait_loop

:launch_ui
echo Opening Banana Food POS...

:: Launch Edge with Silent Kiosk Printing
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --kiosk-printing --user-data-dir="%LOCALAPPDATA%\BananaFoodPOS\edge-pos-profile" --app=http://localhost:3000
    exit
)
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --kiosk-printing --user-data-dir="%LOCALAPPDATA%\BananaFoodPOS\edge-pos-profile" --app=http://localhost:3000
    exit
)

:: Launch Chrome with Silent Kiosk Printing
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --kiosk-printing --user-data-dir="%LOCALAPPDATA%\BananaFoodPOS\chrome-pos-profile" --app=http://localhost:3000
    exit
)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --kiosk-printing --user-data-dir="%LOCALAPPDATA%\BananaFoodPOS\chrome-pos-profile" --app=http://localhost:3000
    exit
)

start msedge --kiosk-printing --user-data-dir="%LOCALAPPDATA%\BananaFoodPOS\edge-pos-profile" --app=http://localhost:3000 2>nul || start http://localhost:3000
exit
