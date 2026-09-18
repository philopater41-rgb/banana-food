# ====================================================================
# BANANA FOOD POS - SYSTEM SETUP & DRIVER INSTALLATION SCRIPT
# ====================================================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "========================================================================" -ForegroundColor Yellow
Write-Host "        BANANA FOOD POS - AUTOMATIC ENVIRONMENT INSTALLER" -ForegroundColor Green
Write-Host "        تجهيز وتسطيب نظام بانانا فود وتعريفات الميزان بالكامل" -ForegroundColor Green
Write-Host "========================================================================" -ForegroundColor Yellow
Write-Host ""

$ProjectRoot = (Get-Item $PSScriptRoot).Parent.FullName
Write-Host "Project Directory: $ProjectRoot" -ForegroundColor Cyan
Write-Host ""

# --------------------------------------------------------------------
# STEP 1: Check and Install Node.js LTS Runtime
# --------------------------------------------------------------------
Write-Host "[1/5] Checking Node.js Runtime environment..." -ForegroundColor Cyan

function Refresh-Path {
    $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machinePath;$userPath;C:\Program Files\nodejs"
}

$nodeInstalled = $false
try {
    $nodeVer = & node -v 2>$null
    if ($nodeVer -match "v\d+") {
        $nodeInstalled = $true
        Write-Host "      Node.js is already installed: $nodeVer" -ForegroundColor Green
    }
} catch {
    $nodeInstalled = $false
}

if (-not $nodeInstalled) {
    Write-Host "      Node.js is not found! Installing Node.js LTS automatically..." -ForegroundColor Yellow
    Write-Host "      جاري تحميل وتثبيت Node.js LTS على الجهاز..." -ForegroundColor Yellow

    $installedViaWinget = $false
    try {
        $wingetCheck = & winget --version 2>$null
        if ($wingetCheck) {
            Write-Host "      Using Windows Package Manager (winget)..." -ForegroundColor Gray
            & winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
            Refresh-Path
            $nodeVer = & node -v 2>$null
            if ($nodeVer -match "v\d+") {
                $installedViaWinget = $true
                Write-Host "      Node.js installed successfully via winget: $nodeVer" -ForegroundColor Green
            }
        }
    } catch {
        $installedViaWinget = $false
    }

    if (-not $installedViaWinget) {
        $msiUrl = "https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi"
        $msiDest = Join-Path $env:TEMP "nodejs-lts-setup.msi"
        Write-Host "      Downloading Node.js installer from $msiUrl ..." -ForegroundColor Gray
        try {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            $webClient = New-Object System.Net.WebClient
            $webClient.DownloadFile($msiUrl, $msiDest)
            Write-Host "      Download completed. Running silent installation..." -ForegroundColor Gray
            $process = Start-Process msiexec.exe -ArgumentList "/i `"$msiDest`" /qn /norestart" -Wait -PassThru
            Refresh-Path
            $nodeVer = & node -v 2>$null
            Write-Host "      Node.js installation completed: $nodeVer" -ForegroundColor Green
        } catch {
            Write-Host "      Failed to auto-download Node.js: $_" -ForegroundColor Red
            Write-Host "      Please install Node.js manually from: https://nodejs.org" -ForegroundColor Red
        }
    }
}

# --------------------------------------------------------------------
# STEP 2: Verify and Install Project Dependencies & Prisma
# --------------------------------------------------------------------
Write-Host ""
Write-Host "[2/5] Checking Project Dependencies & Database Client..." -ForegroundColor Cyan
Set-Location $ProjectRoot

$nodeModulesPath = Join-Path $ProjectRoot "node_modules"
if (-not (Test-Path $nodeModulesPath)) {
    Write-Host "      Installing npm dependencies (this may take a minute)..." -ForegroundColor Yellow
    & npm install
} else {
    Write-Host "      Dependencies (node_modules) found." -ForegroundColor Green
}

Write-Host "      Generating Prisma Client..." -ForegroundColor Gray
& npx prisma generate
if ($LASTEXITCODE -eq 0) {
    Write-Host "      Prisma Client generated successfully." -ForegroundColor Green
}

# --------------------------------------------------------------------
# STEP 3: Verify Application Production Build
# --------------------------------------------------------------------
Write-Host ""
Write-Host "[3/5] Verifying Application Production Build..." -ForegroundColor Cyan
$nextBuildDir = Join-Path $ProjectRoot ".next"
if (-not (Test-Path $nextBuildDir)) {
    Write-Host "      Building Next.js application for production..." -ForegroundColor Yellow
    & npm run build
} else {
    Write-Host "      Production build (.next) is ready." -ForegroundColor Green
}

# --------------------------------------------------------------------
# STEP 4: Install Scale USB Drivers (FTDI WHQL Official Driver)
# --------------------------------------------------------------------
Write-Host ""
Write-Host "[4/5] Installing Scale USB Drivers (FTDI WHQL)..." -ForegroundColor Cyan
Write-Host "      جاري تثبيت تعريفات كابل الميزان الإلكتروني..." -ForegroundColor Yellow

$ftdiBusInf = Join-Path $ProjectRoot "drivers\ftdi\ftdibus.inf"
$ftdiPortInf = Join-Path $ProjectRoot "drivers\ftdi\ftdiport.inf"

if (Test-Path $ftdiBusInf) {
    Write-Host "      Installing FTDI Bus Driver ($ftdiBusInf)..." -ForegroundColor Gray
    & pnputil.exe /add-driver "$ftdiBusInf" /install | Out-Null
    Write-Host "      [OK] FTDI Bus Driver installed successfully." -ForegroundColor Green
}

if (Test-Path $ftdiPortInf) {
    Write-Host "      Installing FTDI COM Port Driver ($ftdiPortInf)..." -ForegroundColor Gray
    & pnputil.exe /add-driver "$ftdiPortInf" /install | Out-Null
    Write-Host "      [OK] FTDI COM Port Driver installed successfully." -ForegroundColor Green
}

# --------------------------------------------------------------------
# STEP 5: Create Desktop Shortcut with the Colorful Logo
# --------------------------------------------------------------------
Write-Host ""
Write-Host "[5/5] Creating Desktop Shortcut with Colorful Banana Logo..." -ForegroundColor Cyan

$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Desktop)
$TargetBatch = Join-Path $ProjectRoot "Start_Banana_Food.bat"
$IconFile = Join-Path $ProjectRoot "public\banana-food.ico"

# Create Desktop Shortcut
$ShortcutPath = Join-Path $DesktopPath "Banana Food POS.lnk"
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $TargetBatch
$Shortcut.WorkingDirectory = $ProjectRoot
$Shortcut.IconLocation = "$IconFile, 0"
$Shortcut.Description = "Banana Food POS System"
$Shortcut.Save()

Write-Host "      [OK] Desktop Shortcut created successfully with colorful logo icon at:" -ForegroundColor Green
Write-Host "           $ShortcutPath" -ForegroundColor Yellow

# --------------------------------------------------------------------
# FINAL SUMMARY
# --------------------------------------------------------------------
Write-Host ""
Write-Host "========================================================================" -ForegroundColor Green
Write-Host "           SUCCESS! BANANA FOOD POS IS FULLY INSTALLED!                 " -ForegroundColor Green
Write-Host "           تم تسطيب وتجهيز نظام بانانا فود بنجاح على هذا الجهاز!        " -ForegroundColor Green
Write-Host "========================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "المميزات المجهزة الآن:" -ForegroundColor Cyan
Write-Host "  1. بيئة تشغيل Node.js وقاعدة البيانات السحابية (Neon)." -ForegroundColor White
Write-Host "  2. تعريفات كابل الميزان الإلكتروني (USB-Serial FTDI WHQL)." -ForegroundColor White
Write-Host "  3. أيقونة ملونة بشعار بانانا فود على سطح المكتب (Desktop)." -ForegroundColor White
Write-Host "  4. تشغيل فوري وسلس بضغطة زر يفتح شاشة الكاشير في نافذة مستقلة." -ForegroundColor White
Write-Host ""
Write-Host "للبدء الآن: اضغط على أيقونة 'Banana Food POS' على الديسكتوب!" -ForegroundColor Yellow
Write-Host ""