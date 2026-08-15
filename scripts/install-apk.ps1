# Install the built dsh-remote APK onto a connected phone (USB debugging on)
# and launch it. Usage: powershell -File install-apk.ps1 [-Type debug|release]
# Pure ASCII on purpose: this script also runs under Windows PowerShell 5.1
# (see docs/pitfalls.zh-CN.md P1 - PS 5.1 reads UTF-8 no-BOM as ANSI).
param(
    [ValidateSet('debug', 'release')]
    [string]$Type = 'debug'
)

$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$apk = Join-Path $repo "apk\app\build\outputs\apk\$Type\app-$Type.apk"
if (-not (Test-Path $apk)) {
    $capital = $Type.Substring(0, 1).ToUpper() + $Type.Substring(1)
    Write-Error "APK not found: $apk`nBuild it first: cd apk; .\gradlew.bat assemble$capital"
    exit 1
}

$adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
if (-not (Test-Path $adb)) {
    Write-Error "adb not found at $adb (install Android SDK platform-tools)"
    exit 1
}

Write-Host "Installing $Type APK: $apk"
& $adb install -r $apk
if ($LASTEXITCODE -ne 0) {
    Write-Error "adb install failed (exit $LASTEXITCODE) - is the phone connected with USB debugging enabled?"
    exit $LASTEXITCODE
}

Write-Host 'Launching DSH Remote...'
& $adb shell am start -n dev.dsh.remote/.MainActivity
Write-Host 'Debug builds: open chrome://inspect in desktop Chrome to inspect the WebView.'
