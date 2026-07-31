# Day & Night POS - one-time installer for the cafe computer.
# Run install-cafe-pos.bat by double-clicking it.

$ErrorActionPreference = 'Stop'
$appRoot = Join-Path $env:LOCALAPPDATA 'DayNightPOS'
$appPath = Join-Path $appRoot 'app'
$zipPath = Join-Path $env:TEMP 'day-night-pos-main.zip'
$extractPath = Join-Path $env:TEMP 'day-night-pos-extract'
$repoZip = 'https://github.com/philopater41-rgb/day-night/archive/refs/heads/main.zip'
$localPackage = Join-Path $PSScriptRoot 'day-night-pos-package.zip'
$bundledEnvFile = Join-Path $PSScriptRoot '.env'
$bundledIconFile = Join-Path $PSScriptRoot 'day-night-pos.ico'

function Write-Step([string]$message) {
  Write-Host "`n==> $message" -ForegroundColor Cyan
}

function Get-NodeCommand {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if ($node) { return $node.Source }
  $candidate = Join-Path $env:ProgramFiles 'nodejs\node.exe'
  if (Test-Path $candidate) {
    $env:Path = "$(Split-Path $candidate);$env:Path"
    return $candidate
  }
  return $null
}

Write-Host 'Day & Night POS - Cafe Computer Installer' -ForegroundColor Yellow

if (-not (Get-NodeCommand)) {
  Write-Step 'Installing Node.js (one time only)'
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw 'winget was not found. Update Windows App Installer, then run this file again.'
  }
  winget install --id OpenJS.NodeJS.LTS --exact --accept-source-agreements --accept-package-agreements
  if (-not (Get-NodeCommand)) {
    throw 'Node.js was installed. Close this window and run install-cafe-pos.bat again.'
  }
}

Write-Step 'Downloading the latest POS version'
Remove-Item -LiteralPath $extractPath -Recurse -Force -ErrorAction SilentlyContinue
if (Test-Path $localPackage) {
  Write-Host 'Using the local package from this folder.' -ForegroundColor Green
  Copy-Item -LiteralPath $localPackage -Destination $zipPath -Force
} else {
  Invoke-WebRequest -Uri $repoZip -OutFile $zipPath
}
Expand-Archive -LiteralPath $zipPath -DestinationPath $extractPath -Force
$downloadedApp = Get-ChildItem -LiteralPath $extractPath -Directory | Select-Object -First 1
if (-not $downloadedApp) { throw 'Could not extract the project files.' }

Write-Step 'Preparing application files'
New-Item -ItemType Directory -Force -Path $appRoot | Out-Null
$previousEnvFile = Join-Path $appPath '.env'
$previousEnvContents = if (Test-Path $previousEnvFile) { Get-Content -LiteralPath $previousEnvFile -Raw } else { $null }
Remove-Item -LiteralPath $appPath -Recurse -Force -ErrorAction SilentlyContinue
Move-Item -LiteralPath $downloadedApp.FullName -Destination $appPath

$envFile = Join-Path $appPath '.env'
if ($previousEnvContents) {
  Set-Content -LiteralPath $envFile -Value $previousEnvContents -Encoding utf8
} elseif (Test-Path $bundledEnvFile) {
  Copy-Item -LiteralPath $bundledEnvFile -Destination $envFile -Force
} elseif (-not (Test-Path $envFile)) {
  Write-Host 'Paste the Neon DATABASE_URL (only required once):' -ForegroundColor Yellow
  $databaseUrl = Read-Host 'DATABASE_URL'
  if ([string]::IsNullOrWhiteSpace($databaseUrl)) { throw 'DATABASE_URL is required.' }
  Set-Content -LiteralPath $envFile -Value "DATABASE_URL=`"$databaseUrl`"" -Encoding utf8
}

Write-Step 'Installing packages and building the local app (may take several minutes)'
Push-Location $appPath
try {
  npm.cmd ci
  npx.cmd prisma generate
  npx.cmd next build
} finally {
  Pop-Location
}

$launcher = Join-Path $appRoot 'Open Day & Night POS.cmd'
@"
@echo off
cd /d "$appPath"
start "Day & Night POS Server" /min cmd /c "npm.cmd start"
timeout /t 4 /nobreak >nul
start http://localhost:3000
"@ | Set-Content -LiteralPath $launcher -Encoding ascii

$desktopLauncher = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Open Day & Night POS.lnk'
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
  Copy-Item -LiteralPath $launcher -Destination (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Open Day & Night POS.cmd') -Force
}

Write-Host "`nInstallation completed successfully." -ForegroundColor Green
Write-Host "For daily use, double-click the Day & Night POS icon on the Desktop." -ForegroundColor Green
& $launcher
