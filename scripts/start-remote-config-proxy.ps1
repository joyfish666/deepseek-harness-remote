# Auto-start the dsh remote-config proxy (see docs/remote-config.zh-CN.md).
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File <this file>
#
# Behavior (mirrors start-dsh.ps1):
#   1. If the proxy port (default 3081) is already listening, exit.
#   2. Otherwise run scripts/remote-config-proxy.mjs under node; logs to
#      ~/.dsh/logs/remote-config-proxy.log.
#   3. On abnormal exit, wait 10 seconds and restart (watchdog loop).
#
# Config: the proxy reads DSH_PROXY_PORT / DSH_PROXY_TARGET / DSH_PROXY_TOKEN
# from the environment. Set them persistently with setx (new processes pick
# them up), e.g.:  setx DSH_PROXY_TOKEN <random-token>
#
# NOTE: keep this file ASCII-only so it parses correctly under Windows
# PowerShell 5.1 regardless of the system codepage (UTF-8-without-BOM files
# are read as ANSI there). No $ErrorActionPreference='Stop' on purpose: a
# stderr line from the native command redirected with *>> becomes a
# terminating error under PS 5.1 and would kill the watchdog loop.
param()

$logDir = Join-Path $env:USERPROFILE '.dsh\logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir 'remote-config-proxy.log'
$proxyJs = Join-Path $PSScriptRoot 'remote-config-proxy.mjs'

function Write-Log([string]$msg) {
  "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg" | Out-File -Append -Encoding utf8 -FilePath $logFile
}

$port = 3081
if ($env:DSH_PROXY_PORT) { $port = [int]$env:DSH_PROXY_PORT }
while ($true) {
  $busy = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($busy) {
    Write-Log "port $port already in use (proxy already running) - exiting"
    exit 0
  }
  if (-not (Test-Path $proxyJs)) {
    Write-Log "proxy script not found: $proxyJs - exiting"
    exit 1
  }
  Write-Log "starting remote-config-proxy (port $port, script: $proxyJs)"
  & node $proxyJs *>> $logFile
  $code = $LASTEXITCODE
  Write-Log "proxy exited with code $code - restarting in 10s"
  Start-Sleep -Seconds 10
}
