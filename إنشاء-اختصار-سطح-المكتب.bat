@echo off
title Create Desktop Shortcut
cd /d "%~dp0"

echo ====================================================
echo   Creating BANANA FOOD POS Desktop Shortcut...
echo ====================================================

powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([System.IO.Path]::Combine([System.Environment]::GetFolderPath('Desktop'), 'BANANA FOOD POS.lnk')); $s.TargetPath = [System.IO.Path]::Combine('%~dp0', 'start-pos.bat'); $s.WorkingDirectory = '%~dp0'; $icon = [System.IO.Path]::Combine('%~dp0', 'day-night-pos.ico'); if (Test-Path $icon) { $s.IconLocation = $icon }; $s.Save()"

echo.
echo [+] Done! Shortcut created on Desktop.
echo.
pause
