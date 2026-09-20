Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Get project root (parent directory of scripts folder)
ScriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
ProjectRoot = fso.GetParentFolderName(ScriptDir)

' Ensure Node.js path is available
Dim nodeCmd
If fso.FileExists("C:\Program Files\nodejs\node.exe") Then
    nodeCmd = """C:\Program Files\nodejs\node.exe"""
Else
    nodeCmd = "node"
End If

' Change directory to project root and run npm start hidden (window style 0, wait on return false)
WshShell.CurrentDirectory = ProjectRoot
WshShell.Run "cmd.exe /c npm start", 0, False
