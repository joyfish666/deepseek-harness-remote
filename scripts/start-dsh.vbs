' start-dsh.vbs - hidden launcher for the dsh-web watchdog (start-dsh.ps1).
' Window mode 0 = SW_HIDE: the powershell watchdog runs with no visible
' console, so no cmd/powershell/Windows Terminal window appears at logon.
' Registered as scheduled task dsh-web: wscript.exe "path\start-dsh.vbs"
Set sh = CreateObject("WScript.Shell")
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""C:\Users\wang\Desktop\vscode\deepseek-harness-remote\scripts\start-dsh.ps1""", 0, False
