# Auto-start the remote-gateway at logon (used with Tailscale Serve path /m for phone access).
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File <this file> [-WorkDir <dir>]
#
# Behavior:
#   1. If port 3100 is already in use (gateway is running), exit immediately to avoid a second instance.
#   2. Otherwise start `node server.js`; logs go to ~/.dsh/logs/gateway.log.
#   3. If the gateway exits abnormally, wait 10 seconds and restart it (watchdog loop).
#
# NOTE: keep this file ASCII-only so it parses correctly under Windows PowerShell 5.1
# regardless of the system codepage (UTF-8-without-BOM files are read as ANSI there).
param(
  [string]$WorkDir = $PSScriptRoot
)
$ErrorActionPreference = 'Stop'

$logDir = Join-Path $env:USERPROFILE '.dsh\logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir 'gateway.log'

function Write-Log([string]$msg) {
  "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg" | Out-File -Append -Encoding utf8 -FilePath $logFile
}

Set-Location $WorkDir
while ($true) {
  $busy = Get-NetTCPConnection -LocalPort 3100 -State Listen -ErrorAction SilentlyContinue
  if ($busy) {
    Write-Log 'port 3100 already in use (gateway already running) - exiting'
    exit 0
  }
  Write-Log "starting remote-gateway (workdir: $WorkDir)"
  & node server.js *>> $logFile
  $code = $LASTEXITCODE
  Write-Log "gateway exited with code $code - restarting in 10s"
  Start-Sleep -Seconds 10
}
