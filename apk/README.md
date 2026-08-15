# dsh-remote (Android shell APK)

> 🌐 **Language**: English · [中文](README.zh-CN.md)

Native Android shell for the [deepseek-harness-remote](..) web setup: a thin
WebView container that hosts the dsh Web GUI at the same Tailscale URL the
phone browser uses — so the mobile-fit adaptation layer and dsh's trust fence
apply unchanged. **No dsh source is touched** (pure overlay, like the rest of
this repo).

**Status**: 🚧 M1 (minimal usable shell) — builds a debug APK, first-run URL
setup, Tailscale guidance, back-key navigation, external links open in the
browser, file upload bridge, downloads, error screen with retry.

## What it is / is not

- ✅ A WebView shell: independent app icon, no browser chrome, fixed URL,
  Tailscale connection guidance, file picker/download bridges.
- ✅ mobile-fit works inside it: the narrow viewport triggers the ≤820px
  mobile layout (drawer, Enter=newline, full-screen settings, etc.).
- ❌ Not a TWA: Tailscale's `*.ts.net` domain cannot host the
  `assetlinks.json` that Trusted Web Activity verification requires, and the
  dsh frontend registers no service worker.
- ❌ No bypass of dsh's security: configuration/credential pages (models,
  plugins, permissions, agent presets) stay loopback-only (HTTP 403 remotely)
  — dsh upstream security design.
- ❌ The phone must keep the **Tailscale app connected** (VPN) to reach the
  computer; the shell only detects the missing VPN and guides the user.

## Requirements

- JDK 17+ (21 verified) and an Android SDK with `platform-tools`,
  `platforms;android-35`, `build-tools;34.0.0` (or 35.0.0). Point Gradle at
  the SDK via `apk/local.properties` (`sdk.dir=C\:\\...\\Android\\Sdk`) or
  `ANDROID_HOME`.
- A phone (Android 8.0+/API 26+) with USB debugging enabled for `adb install`.

## Build & install

```powershell
cd apk
.\gradlew.bat assembleDebug          # first run downloads Gradle + AGP deps
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

Debug builds enable WebView remote debugging: connect the phone over USB and
open `chrome://inspect` in desktop Chrome to drive/inspect the app's page.

## First run

1. Open the app → enter the Tailscale URL of the machine running dsh
   (`https://<machine>.<tailnet>.ts.net/`, no scheme needed) → Connect.
2. If the phone's Tailscale VPN is off, a banner appears with a button that
   opens the Tailscale app.
3. The GUI loads exactly as in the phone browser; verify with the
   mobile-fit checklist (`docs/tutorial.md` section 6).

## Project layout

```
apk/
  settings.gradle.kts / build.gradle.kts / gradle.properties
  app/
    build.gradle.kts                 # dev.dsh.remote, minSdk 26, targetSdk 35
    src/main/
      AndroidManifest.xml
      java/dev/dsh/remote/MainActivity.java   # the whole shell (zero deps)
      res/                           # strings (zh/en), themes (light/night), adaptive icon
```

Zero third-party dependencies: plain `android.app.Activity` + `WebView`,
`SharedPreferences` for the URL, platform `DownloadManager`. The Gradle
wrapper ships in the repo; only the SDK is external.

## Limitations

- Configuration/credential pages return 403 remotely (upstream design); the
  in-app error screen and the GUI's own banner explain this.
- Changing the URL requires clearing app data (M2 adds an in-app settings
  page); clearing data also clears the mobile-fit notice acknowledgement
  (the internal-testing notice reappears once).
- WebView behavior tracks the device's System WebView update channel; very
  old WebView versions may lack `:has()` used by mobile-fit (Chrome 105+).

## License

MIT (this repo).
