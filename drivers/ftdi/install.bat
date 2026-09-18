@echo off
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -NoProfile -Command "Start-Process cmd -ArgumentList '/k \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

echo Installing FTDI Bus Driver...
pnputil /add-driver "C:\FTDI_Driver\ftdibus.inf" /install

echo.
echo Installing FTDI Port Driver...
pnputil /add-driver "C:\FTDI_Driver\ftdiport.inf" /install

echo.
echo ========================================================
echo Driver installation completed! Check Device Manager now.
echo ========================================================
pause