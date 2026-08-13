@echo off
title Day ^& Night POS Installer
cd /d "%~dp0"

echo ====================================================
echo      Day ^& Night POS - Starting Installer
echo ====================================================
echo.

PowerShell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-cafe-pos.ps1"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ====================================================
    echo [!] ERROR: Installation encountered an issue.
    echo Please check the error message above.
    echo ====================================================
    pause
) else (
    echo.
    echo [+] Done!
    pause
)
