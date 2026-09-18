@echo off
setlocal enabledelayedexpansion
title Banana Food POS Launcher
cd /d "%~dp0"

echo [1/2] Checking POS Server status...
powershell -NoProfile -Command "(Test-NetConnection -ComputerName 127.0.0.1 -Port 3000 -WarningAction SilentlyContinue).TcpTestSucceeded" > "%temp%\bf_port_check.txt" 2>&1
set /p PORT_OPEN=<"%temp%\bf_port_check.txt"
del /f /q "%temp%\bf_port_check.txt" >nul 2>&1

if /i "%PORT_OPEN%"=="True" (
    echo POS Server is already running.
) else (
    echo Starting POS Server in background...
    wscript.exe "%~dp0scripts\start_server_hidden.vbs"
    timeout /t 3 /nobreak >nul
)

echo [2/2] Opening Banana Food POS window...
where msedge >nul 2>&1
if %errorlevel% equ 0 (
    start msedge --app=http://localhost:3000
    exit
)

where chrome >nul 2>&1
if %errorlevel% equ 0 (
    start chrome --app=http://localhost:3000
    exit
)

start http://localhost:3000
exit
