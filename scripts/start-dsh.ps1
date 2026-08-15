# Auto-start the dsh Web UI at logon (used with Tailscale Serve for phone access).
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File <this file> [-WorkDir <dir>]
#
# Behavior:
#   1. If port 3080 is already in use (dsh is running), exit immediately to avoid a second instance.
#   2. Otherwise start the dsh web server; logs go to ~/.dsh/logs/dsh-web.log.
#   3. If dsh exits abnormally, wait 10 seconds and restart it (watchdog loop).
#
# Window-less startup (2026-08-15): npx is a .cmd batch and running it spawns a
# visible cmd.exe window that must stay open (closing it kills dsh web). Instead
# we resolve the installed dsh bin.js and run it with node.exe directly - no
# cmd.exe wrapper, no visible shell window. Falls back to npx when resolution fails.
#
# NOTE: keep this file ASCII-only so it parses correctly under Windows PowerShell 5.1
# regardless of the system codepage (UTF-8-without-BOM files are read as ANSI there).
#
# FIX (2026-08-15): removed $ErrorActionPreference='Stop' - under PowerShell 5.1 a
# stderr line from the native command (npx) redirected with *>> becomes a terminating
# error and would kill the watchdog loop.
param(
  [string]$WorkDir = $PSScriptRoot
)

$logDir = Join-Path $env:USERPROFILE '.dsh\logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir 'dsh-web.log'

function Write-Log([string]$msg) {
  "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg" | Out-File -Append -Encoding utf8 -FilePath $logFile
}

# Resolve the installed dsh entry (node_modules/@deepseek-ai/dsh/lib/bin.js).
# Two lookup paths:
#   1. the dsh shim on PATH (interactive shells have the npx .bin dir injected);
#   2. the npx cache directly (scheduled tasks inherit only the registry PATH,
#      which contains node/npm but NOT the _npx\<hash>\node_modules\.bin dir).
# Returns '' when not resolvable (caller falls back to npx).
function Resolve-DshBinJs {
  $shim = Get-Command dsh -CommandType ExternalScript -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($shim) {
    $binDir = Split-Path (Split-Path $shim.Source -Parent) -Parent   # ...\.bin -> node_modules
    $candidate = Join-Path $binDir '@deepseek-ai\dsh\lib\bin.js'
    if (Test-Path $candidate) { return $candidate }
  }
  $npxRoot = Join-Path $env:LOCALAPPDATA 'npm-cache\_npx'
  $cached = Get-ChildItem -Path $npxRoot -Directory -ErrorAction SilentlyContinue |
    ForEach-Object {
      $candidate = Join-Path $_.FullName 'node_modules\@deepseek-ai\dsh\lib\bin.js'
      if (Test-Path $candidate) { Get-Item $candidate }
    } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if ($cached) { return $cached.FullName }
  return ''
}

Set-Location $WorkDir
while ($true) {
  $busy = Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue
  if ($busy) {
    Write-Log 'port 3080 already in use (dsh already running) - exiting'
    exit 0
  }
  $binJs = Resolve-DshBinJs
  if ($binJs) {
    Write-Log "starting dsh web (workdir: $WorkDir, bin: $binJs)"
    & node "$binJs" web *>> $logFile
  } else {
    Write-Log "starting dsh web via npx (workdir: $WorkDir)"
    & npx --yes @deepseek-ai/dsh web *>> $logFile
  }
  $code = $LASTEXITCODE
  Write-Log "dsh exited with code $code - restarting in 10s"
  Start-Sleep -Seconds 10
}
