' Hidden-launch wrapper for start-remote-config-proxy.ps1 (Task Scheduler
' zero-window pattern, see docs/pitfalls.zh-CN.md P25/P26: SW_HIDE must be
' applied by wscript, not by powershell -WindowStyle Hidden).
Set shell = CreateObject("WScript.Shell")
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
shell.Run "powershell -NoProfile -ExecutionPolicy Bypass -File """ & scriptDir & "\start-remote-config-proxy.ps1""", 0, False
