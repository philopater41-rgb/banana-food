@echo off
setlocal
cd /d "%~dp0"

echo ========================================================
echo        BANANA FOOD POS - SYSTEM AUTO INSTALLER
echo        تسطيب وتشغيل نظام بانانا فود لأول مرة
echo ========================================================
echo.

:: Check for Administrative privileges
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Requesting Administrator privileges...
    echo [!] جاري طلب صلاحيات الأدمن للتسطيب...
    powershell -NoProfile -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

:: Execute main PowerShell setup script
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup.ps1"

if %errorlevel% neq 0 (
    echo.
    echo [!] Setup encountered a problem. Please check the messages above.
    pause
    exit /b 1
)

pause
exit /b 0
