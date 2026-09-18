Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Get project root (parent directory of scripts folder)
ScriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
ProjectRoot = fso.GetParentFolderName(ScriptDir)

' Change directory to project root and run next start hidden (window style 0, wait on return false)
WshShell.CurrentDirectory = ProjectRoot
WshShell.Run "cmd.exe /c node ""node_modules\next\dist\bin\next"" start", 0, False
