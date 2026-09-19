@echo off
setlocal enabledelayedexpansion
title Banana Food POS Launcher
cd /d "%~dp0"

if exist "C:\Program Files\nodejs\node.exe" (
    set "PATH=%PATH%;C:\Program Files\nodejs"
)

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ========================================================
    echo  [!] Node.js is not installed on this computer!
    echo  [!] برنامج Node.js غير مثبت على هذا الجهاز!
    echo ========================================================
    echo  يرجى تشغيل Setup_Banana_Food.bat لتثبيته تلقائيا
    echo  أو تثبيت الملف من مجلد installers\node-v20.18.0-x64.msi
    echo ========================================================
    echo.
    pause
    exit /b 1
)

echo [1/2] Checking POS Server status...
powershell -NoProfile -Command "(Test-NetConnection -ComputerName 127.0.0.1 -Port 3000 -WarningAction SilentlyContinue).TcpTestSucceeded" > "%temp%\bf_port_check.txt" 2>&1
set /p PORT_OPEN=<"%temp%\bf_port_check.txt"
del /f /q "%temp%\bf_port_check.txt" >nul 2>&1

if /i "%PORT_OPEN%"=="True" (
    echo POS Server is already running.
) else (
    echo Starting POS Server in background...
    wscript.exe "%~dp0scripts\start_server_hidden.vbs"
    echo Waiting for server to be ready...
    set count=0
    :wait_loop
    set /a count+=1
    timeout /t 1 /nobreak >nul
    powershell -NoProfile -Command "(Test-NetConnection -ComputerName 127.0.0.1 -Port 3000 -WarningAction SilentlyContinue).TcpTestSucceeded" > "%temp%\bf_port_check.txt" 2>&1
    set /p PORT_READY=<"%temp%\bf_port_check.txt"
    del /f /q "%temp%\bf_port_check.txt" >nul 2>&1
    if /i "!PORT_READY!"=="True" (
        echo [OK] Server is ready!
        goto launch_ui
    )
    if !count! lss 12 goto wait_loop
)

:launch_ui

echo [2/2] Opening Banana Food POS window with Silent Instant Printing...

:: 1. Direct path check for Microsoft Edge (Standard on 64-bit Windows)
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --kiosk-printing --user-data-dir="%LOCALAPPDATA%\BananaFoodPOS\edge-pos-profile" --app=http://localhost:3000
    exit
)
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --kiosk-printing --user-data-dir="%LOCALAPPDATA%\BananaFoodPOS\edge-pos-profile" --app=http://localhost:3000
    exit
)

:: 2. Direct path check for Google Chrome
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --kiosk-printing --user-data-dir="%LOCALAPPDATA%\BananaFoodPOS\chrome-pos-profile" --app=http://localhost:3000
    exit
)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --kiosk-printing --user-data-dir="%LOCALAPPDATA%\BananaFoodPOS\chrome-pos-profile" --app=http://localhost:3000
    exit
)

:: 3. Registry App Path fallback
start msedge --kiosk-printing --user-data-dir="%LOCALAPPDATA%\BananaFoodPOS\edge-pos-profile" --app=http://localhost:3000 2>nul || start chrome --kiosk-printing --user-data-dir="%LOCALAPPDATA%\BananaFoodPOS\chrome-pos-profile" --app=http://localhost:3000 2>nul || start http://localhost:3000
exit
