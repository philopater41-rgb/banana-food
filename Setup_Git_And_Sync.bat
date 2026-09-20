@echo off
setlocal enabledelayedexpansion
title Banana Food POS - Setup Git & Sync
cd /d "%~dp0"

echo ========================================================
echo       BANANA FOOD POS - SETUP GIT & AUTO SYNC
echo       تثبيت Git وربط الكيسة بالمشروع وتحديثها
echo ========================================================
echo.

:: 1. Check if Git is installed or in default path
where git >nul 2>&1
if %errorlevel% neq 0 (
    if exist "C:\Program Files\Git\cmd\git.exe" (
        set "PATH=%PATH%;C:\Program Files\Git\cmd"
    )
)

where git >nul 2>&1
if %errorlevel% neq 0 (
    echo [1/4] Git is not installed! Installing Git via winget...
    echo [1/4] جاري تثبيت برنامج Git تلقائياً عبر ويندوز...
    winget install --id Git.Git -e --source winget --accept-source-agreements --accept-package-agreements
    
    if exist "C:\Program Files\Git\cmd" (
        set "PATH=%PATH%;C:\Program Files\Git\cmd"
    )
    
    where git >nul 2>&1
    if %errorlevel% neq 0 (
        echo.
        echo [!] Could not install Git automatically.
        echo [!] يرجى تثبيت Git يدوياً من: https://git-scm.com/download/win
        pause
        exit /b 1
    )
    echo [OK] Git installed successfully!
) else (
    echo [1/4] Git is already installed.
    echo [1/4] برنامج Git مثبت وجاهز.
)

:: 2. Connect repository
echo.
echo [2/4] Connecting to GitHub repository...
echo [2/4] جاري ربط المجلد بالريبو على GitHub...

if not exist ".git" (
    git init
    git remote add origin https://github.com/philopater41-rgb/banana-food.git
) else (
    git remote set-url origin https://github.com/philopater41-rgb/banana-food.git
)

:: 3. Fetch and sync with latest main
echo.
echo [3/4] Pulling latest updates from GitHub...
echo [3/4] جاري سحب أحدث التعديلات...
echo (إذا ظهرت لك نافذة تسجيل الدخول إلى GitHub في المتصفح، سجل دخول بحسابك)
git fetch origin main
if %errorlevel% neq 0 (
    echo.
    echo [!] Failed to fetch from GitHub. Please check your credentials or internet.
    echo [!] فشل الاتصال، تأكد من الاتصال بالإنترنت وتسجيل الدخول في جيت هاب.
    pause
    exit /b 1
)

git branch -M main
git reset --hard origin/main
git branch --set-upstream-to=origin/main main

:: 4. Build application
echo.
echo [4/4] Building latest application...
echo [4/4] جاري عمل Build للتطبيق...
if exist "C:\Program Files\nodejs" (
    set "PATH=%PATH%;C:\Program Files\nodejs"
)
call npm run build

:: 5. Restart server if running
taskkill /f /im node.exe >nul 2>&1

echo.
echo ========================================================
echo   [OK] تم تثبيت Git وربط الكيسة وتحديث النظام بنجاح!
echo   من الآن فصاعداً، لتحديث الكيسة في أي وقت فقط شغل:
echo   Update_Banana_Food.bat
echo ========================================================
echo.
pause
exit /b 0
