# update-dsh.ps1 - one-click update of the globally installed dsh.
#
# - If a newer version exists on npm: installs it globally, then asks whether to
#   restart dsh web so the new version takes effect immediately (the watchdog
#   relaunches it; see start-dsh.ps1).
# - If the installed version is already the latest: tells you and exits.
#
# NOTE: save this file as UTF-8 WITH BOM so Windows PowerShell 5.1 parses the
# Chinese text correctly (pitfalls P1). The .cmd launcher sets the console
# codepage to 65001 so the output renders correctly.
#
# Usage: double-click scripts/update-dsh.cmd

$ErrorActionPreference = 'Stop'
$log = Join-Path $env:USERPROFILE '.dsh\logs\dsh-web.log'
$vbs = Join-Path $PSScriptRoot 'start-dsh.vbs'
$port = 3080

# Reads the version of the globally installed dsh ('' when not installed).
function Get-GlobalDshVersion {
  $root = & npm root -g 2>$null
  if (-not $root) { return '' }
  $pkg = Join-Path $root '@deepseek-ai\dsh\package.json'
  if (-not (Test-Path $pkg)) { return '' }
  return (Get-Content $pkg -Raw | ConvertFrom-Json).version
}

# Semantic-ish version compare that understands "rc.N" prereleases.
# Returns -1 when $a < $b, 0 when equal, 1 when $a > $b.
function Compare-Version([string]$a, [string]$b) {
  $ap = $a -split '-'
  $bp = $b -split '-'
  $an = $ap[0] -split '\.'
  $bn = $bp[0] -split '\.'
  $n = [Math]::Max($an.Count, $bn.Count)
  for ($i = 0; $i -lt $n; $i++) {
    $av = if ($i -lt $an.Count) { [int]$an[$i] } else { 0 }
    $bv = if ($i -lt $bn.Count) { [int]$bn[$i] } else { 0 }
    if ($av -lt $bv) { return -1 }
    if ($av -gt $bv) { return 1 }
  }
  $apre = if ($ap.Count -gt 1) { $ap[1] } else { '' }
  $bpre = if ($bp.Count -gt 1) { $bp[1] } else { '' }
  if ($apre -eq $bpre) { return 0 }
  if ($apre -eq '') { return 1 }   # a release beats a prerelease
  if ($bpre -eq '') { return -1 }
  $ar = [regex]::Match($apre, '(\d+)')
  $br = [regex]::Match($bpre, '(\d+)')
  $ai = if ($ar.Success) { [int]$ar.Groups[1].Value } else { 0 }
  $bi = if ($br.Success) { [int]$br.Groups[1].Value } else { 0 }
  if ($ai -lt $bi) { return -1 }
  if ($ai -gt $bi) { return 1 }
  return [string]::CompareOrdinal($apre, $bpre)
}

# Stops the running dsh web on port 3080 (the watchdog restarts it with the
# new global version within ~10s) or starts the watchdog via the vbs launcher.
function Restart-DshWeb {
  $busy = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($busy) {
    $pid0 = $busy[0].OwningProcess
    Write-Host ("   正在停止当前 dsh web (PID {0})，看门狗 10 秒后自动以新版重启…" -f $pid0)
    Stop-Process -Id $pid0 -Force
    for ($i = 0; $i -lt 60; $i++) {
      Start-Sleep -Seconds 1
      $l = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
      if ($l) { Write-Host "   新版本已启动：http://127.0.0.1:${port}"; return }
    }
    Write-Host "   等待超时，请查看日志：$log"
  }
  elseif (Test-Path $vbs) {
    Write-Host "   当前 dsh 未在运行，通过 start-dsh.vbs 启动看门狗…"
    Start-Process wscript.exe -ArgumentList "`"$vbs`""
  }
  else {
    Write-Host "   dsh 未在运行且找不到 $vbs，请手动启动 dsh web。"
  }
}

Write-Host "=============================================="
Write-Host "            dsh 一键更新"
Write-Host "=============================================="

$current = Get-GlobalDshVersion
if ($current) { Write-Host ("当前版本 : " + $current) }
else { Write-Host "当前版本 : 未安装全局 dsh（将全新安装）" }

Write-Host "正在查询 npm 最新版…"
$latest = (& npm view @deepseek-ai/dsh version 2>$null | Select-Object -Last 1).Trim()
if (-not $latest) {
  Write-Host ""
  Write-Host "查询失败：无法连接 npm registry。"
  Write-Host "请检查网络（国内网络可配置镜像或代理后重试）。"
  Write-Host ""
  Read-Host "按回车退出"
  exit 1
}
Write-Host ("最新版本 : " + $latest)

if ($current -and (Compare-Version $current $latest) -ge 0) {
  Write-Host ""
  Write-Host "已经是最新版本 ($current)，无需更新。"
  Write-Host ""
  Read-Host "按回车退出"
  exit 0
}

Write-Host ""
Write-Host "发现新版本，开始安装（可能需要几分钟）…"
$env:NODE_OPTIONS = '--max-old-space-size=4096'
& npm install -g @deepseek-ai/dsh@latest
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "安装失败（npm 退出码 $LASTEXITCODE），请查看上方错误信息。"
  Write-Host ""
  Read-Host "按回车退出"
  exit 1
}
$new = Get-GlobalDshVersion
Write-Host ("安装完成，当前版本 : " + $new)

Write-Host ""
$ans = Read-Host "是否立即重启 dsh web 应用新版？(Y/n，回车默认 Y)"
if ($ans -eq '' -or $ans -match '^[Yy]') { Restart-DshWeb }
else { Write-Host "已跳过重启；重启 dsh web（或重启电脑）后生效。" }

Write-Host ""
Read-Host "按回车退出"
