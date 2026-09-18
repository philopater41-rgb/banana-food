@echo off
title BANANA FOOD POS - Update Application
cd /d "%~dp0"

echo ====================================================
echo      BANANA FOOD POS - Updating from GitHub
echo ====================================================
echo.

echo [+] Stopping running server instances...
taskkill /f /im node.exe >nul 2>&1

echo [+] Pulling latest updates from GitHub...
git pull origin main

echo [+] Generating Prisma client...
call npx.cmd prisma generate

echo [+] Building latest version...
call node "node_modules\next\dist\bin\next" build

echo.
echo ====================================================
echo   Update completed successfully! Starting POS...
echo ====================================================
echo.

call Start_Banana_Food.bat
exit
