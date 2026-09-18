# BANANA FOOD POS - Automated installer script for client machines.
# Run install-cafe-pos.bat by double-clicking it.

$ErrorActionPreference = 'Stop'
$appRoot = Join-Path $env:LOCALAPPDATA 'BananaFoodPOS'
$appPath = Join-Path $appRoot 'app'
$zipPath = Join-Path $env:TEMP 'banana-food-pos-main.zip'
$extractPath = Join-Path $env:TEMP 'banana-food-pos-extract'
$repoZip = ''
$localPackage = Join-Path $PSScriptRoot 'banana-food-pos-package.zip'
$bundledEnvFile = Join-Path $PSScriptRoot '.env'
$bundledIconFile = Join-Path $PSScriptRoot 'day-night-pos.ico'

function Write-Step([string]$message) {
  Write-Host "`n==> $message" -ForegroundColor Cyan
}

function Ensure-NodeInPath {
  $nodeDirs = @(
    (Join-Path $env:ProgramFiles 'nodejs'),
    (Join-Path $env:LOCALAPPDATA 'Programs\node'),
    (Join-Path $env:APPDATA 'npm')
  )
  foreach ($dir in $nodeDirs) {
    if (Test-Path $dir) {
      if ($env:Path -notlike "*$dir*") {
        $env:Path = "$dir;$env:Path"
      }
    }
  }
}

function Get-NodeCommand {
  Ensure-NodeInPath
  $node = Get-Command node -ErrorAction SilentlyContinue
  if ($node) { return $node.Source }
  return $null
}

Write-Host "====================================================" -ForegroundColor Yellow
Write-Host "  BANANA FOOD POS - Client Computer Installation" -ForegroundColor Yellow
Write-Host "====================================================" -ForegroundColor Yellow

# 1. Ensure Node.js is installed
if (-not (Get-NodeCommand)) {
  Write-Step 'Installing Node.js LTS...'
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Host "[!] winget is not available on this system." -ForegroundColor Red
    Write-Host "[!] Please download and install Node.js LTS manually from https://nodejs.org/" -ForegroundColor Red
    throw 'Node.js is missing and winget was not found.'
  }
  
  winget install --id OpenJS.NodeJS.LTS --exact --accept-source-agreements --accept-package-agreements
  Ensure-NodeInPath
  
  if (-not (Get-NodeCommand)) {
    throw 'Node.js was installed. Please restart your computer or command prompt and run install-cafe-pos.bat again.'
  }
}

Write-Host "Node.js detected at: $(Get-NodeCommand)" -ForegroundColor Green

# 2. Stop any running Node processes to avoid file locks
Write-Step 'Stopping any running POS instances...'
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# 3. Prepare application files (Local Package or Remote Download)
Write-Step 'Preparing project files...'
Remove-Item -LiteralPath $extractPath -Recurse -Force -ErrorAction SilentlyContinue

if (Test-Path $localPackage) {
  Write-Host 'Using local package zip from installer folder.' -ForegroundColor Green
  Copy-Item -LiteralPath $localPackage -Destination $zipPath -Force
} else {
  Write-Host 'Downloading latest version from GitHub...' -ForegroundColor Green
  Invoke-WebRequest -Uri $repoZip -OutFile $zipPath
}

Expand-Archive -LiteralPath $zipPath -DestinationPath $extractPath -Force

# Locate extracted app directory (handles both zipped root folder and root files)
$sourceAppPath = $null
if (Test-Path (Join-Path $extractPath 'package.json')) {
  $sourceAppPath = $extractPath
} else {
  $subDir = Get-ChildItem -LiteralPath $extractPath -Directory | Select-Object -First 1
  if ($subDir) {
    $sourceAppPath = $subDir.FullName
  }
}

if (-not $sourceAppPath -or -not (Test-Path (Join-Path $sourceAppPath 'package.json'))) {
  throw 'Invalid package structure: package.json was not found in the extracted files.'
}

# Preserve existing .env file if present
New-Item -ItemType Directory -Force -Path $appRoot | Out-Null
$previousEnvFile = Join-Path $appPath '.env'
$previousEnvContents = if (Test-Path $previousEnvFile) { Get-Content -LiteralPath $previousEnvFile -Raw } else { $null }

# Replace application directory safely
Remove-Item -LiteralPath $appPath -Recurse -Force -ErrorAction SilentlyContinue
Move-Item -LiteralPath $sourceAppPath -Destination $appPath -Force

# Restore or create .env file
$envFile = Join-Path $appPath '.env'
if ($previousEnvContents) {
  Set-Content -LiteralPath $envFile -Value $previousEnvContents -Encoding utf8
} elseif (Test-Path $bundledEnvFile) {
  Copy-Item -LiteralPath $bundledEnvFile -Destination $envFile -Force
} elseif (-not (Test-Path $envFile)) {
  Write-Host 'Paste the Neon DATABASE_URL:' -ForegroundColor Yellow
  $databaseUrl = Read-Host 'DATABASE_URL'
  if ([string]::IsNullOrWhiteSpace($databaseUrl)) { throw 'DATABASE_URL is required.' }
  Set-Content -LiteralPath $envFile -Value "DATABASE_URL=`"$databaseUrl`"" -Encoding utf8
}

# 4. Install dependencies and build project
Write-Step 'Installing npm packages and building local application...'
Push-Location $appPath
try {
  Ensure-NodeInPath
  
  Write-Host 'Running npm install...' -ForegroundColor Green
  npm.cmd install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE" }

  Write-Host 'Generating Prisma client...' -ForegroundColor Green
  npx.cmd prisma generate
  if ($LASTEXITCODE -ne 0) { throw "prisma generate failed with exit code $LASTEXITCODE" }

  Write-Host 'Building Next.js app...' -ForegroundColor Green
  npx.cmd next build
  if ($LASTEXITCODE -ne 0) { throw "next build failed with exit code $LASTEXITCODE" }
} finally {
  Pop-Location
}

# 5. Create Desktop Launcher & Launcher script
Write-Step 'Creating Desktop Shortcut...'
$launcher = Join-Path $appRoot 'Open BANANA FOOD POS.cmd'
@"
@echo off
cd /d "$appPath"
start "BANANA FOOD POS Server" /min cmd /c "npm.cmd start"
timeout /t 3 /nobreak >nul
start msedge --kiosk-printing --app=http://localhost:3000 2>nul || start chrome --kiosk-printing --app=http://localhost:3000 2>nul || start http://localhost:3000
"@ | Set-Content -LiteralPath $launcher -Encoding ascii

$desktopLauncher = Join-Path ([Environment]::GetFolderPath('Desktop')) 'BANANA FOOD POS.lnk'
if (Test-Path $bundledIconFile) {
  $installedIcon = Join-Path $appPath 'day-night-pos.ico'
  Copy-Item -LiteralPath $bundledIconFile -Destination $installedIcon -Force
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($desktopLauncher)
  $shortcut.TargetPath = $env:ComSpec
  $shortcut.Arguments = "/c `"`"$launcher`"`""
  $shortcut.WorkingDirectory = $appPath
  $shortcut.IconLocation = "$installedIcon,0"
  $shortcut.Save()
} else {
  Copy-Item -LiteralPath $launcher -Destination (Join-Path ([Environment]::GetFolderPath('Desktop')) 'BANANA FOOD POS.cmd') -Force
}

Write-Host "`n====================================================" -ForegroundColor Green
Write-Host "  Installation Completed Successfully!" -ForegroundColor Green
Write-Host "  Double-click the 'BANANA FOOD POS' icon on your Desktop." -ForegroundColor Green
Write-Host "====================================================" -ForegroundColor Green

& $launcher
