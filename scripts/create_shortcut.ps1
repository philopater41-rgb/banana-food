$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Desktop)
$ShortcutPath = Join-Path $DesktopPath "Banana Food POS.lnk"

$ProjectRoot = (Get-Item $PSScriptRoot).Parent.FullName
$TargetBatch = Join-Path $ProjectRoot "Start_Banana_Food.bat"
$IconFile = Join-Path $ProjectRoot "public\banana-food.ico"

$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $TargetBatch
$Shortcut.WorkingDirectory = $ProjectRoot
$Shortcut.IconLocation = "$IconFile, 0"
$Shortcut.Description = "Banana Food POS System"
$Shortcut.Save()

Write-Host "Created shortcut successfully at: $ShortcutPath" -ForegroundColor Green
