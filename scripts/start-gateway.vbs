' start-gateway.vbs - hidden launcher for the remote-gateway watchdog (start-gateway.ps1).
' Window mode 0 = SW_HIDE: the powershell watchdog runs with no visible
' console, so no cmd/powershell/Windows Terminal window appears at logon.
' Registered as scheduled task dsh-gateway: wscript.exe "path\start-gateway.vbs"
Set sh = CreateObject("WScript.Shell")
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""C:\Users\wang\Desktop\vscode\deepseek-harness-remote\scripts\start-gateway.ps1""", 0, False
