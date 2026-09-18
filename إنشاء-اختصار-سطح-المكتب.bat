@echo off
title Create Desktop Shortcut
cd /d "%~dp0"

echo ====================================================
echo   Creating BANANA FOOD POS Desktop Shortcut...
echo ====================================================

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\create_shortcut.ps1"

echo.
echo [+] Done! Shortcut created on Desktop with Banana Food logo.
echo.
pause
