@echo off
setlocal enabledelayedexpansion
title Banana Food POS - System Updater
cd /d "%~dp0"

echo ========================================================
echo        BANANA FOOD POS - SYSTEM UPDATER
echo        تحديث النظام إلى آخر إصدار من GitHub
echo ========================================================
echo.

if exist "C:\Program Files\nodejs" (
    set "PATH=%PATH%;C:\Program Files\nodejs"
)

where git >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Git is not installed on this PC or not in PATH!
    echo [!] برنامج Git غير مثبت على هذا الجهاز.
    echo.
    echo يمكنك نسخ التعديلات بالفلاشة أو تثبيت Git.
    pause
    exit /b 1
)

echo [1/4] Fetching latest updates from GitHub...
echo [1/4] جاري سحب آخر التحديثات من GitHub...
git pull origin main
if %errorlevel% neq 0 (
    echo.
    echo [!] Failed to pull updates. Check internet connection.
    echo [!] فشل سحب التحديثات، تأكد من اتصال الإنترنت.
    pause
    exit /b 1
)

echo.
echo [2/4] Updating database client schema...
echo [2/4] جاري تحديث برمجيات ومخطط قاعدة البيانات...
call npx prisma generate
if %errorlevel% neq 0 (
    echo.
    echo [!] Prisma generate failed.
    echo [!] فشل تحديث مخطط قاعدة البيانات.
    pause
    exit /b 1
)

echo.
echo [3/4] Compiling and building latest changes...
echo [3/4] جاري عمل Build للتعديلات الجديدة...
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo [!] Build failed. Please check errors above.
    echo [!] حدث خطأ أثناء تجهيز التطبيق.
    pause
    exit /b 1
)

echo.
echo [4/4] Restarting background service...
echo [4/4] إعادة تشغيل السيرفر بالتحديثات الجديدة...
taskkill /f /im node.exe >nul 2>&1

echo.
echo ========================================================
echo   [OK] تم تحديث النظام بنجاح إلى أحدث نسخة!
echo   يمكنك الآن تشغيل Start_Banana_Food.bat كالمعتاد.
echo ========================================================
echo.
pause
exit /b 0
