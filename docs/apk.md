# APK (Native Android Shell) Usage Guide

> 🌐 **Language**: English · [中文](apk.zh-CN.md)

> **Audience**: all users. The APK is a native Android **shell** (WebView
> container) for the dsh Web GUI — using dsh like an app instead of a browser.
> Developers: see `apk/README.md` (build, project layout, limitations).

## 1. Install

- Phone: Android 8.0+ (API 26+);
- Transfer the APK from your computer (`adb install` or copy the file and tap it);
- Allow "install unknown apps" on first install.

## 2. First run

1. Open the app → enter the Tailscale address of the machine running dsh
   (`https://<machine>.<tailnet>.ts.net/`, the `https://` prefix is optional) → Connect;
2. If the phone's Tailscale is not connected, a yellow banner appears at the
   top; tap "Open" to jump to the Tailscale app. The banner disappears once
   connected;
3. The UI is identical to the phone browser (mobile-fit fully applies).
   **Note: configuration/credential pages (models, plugins, permissions,
   agent presets, etc.) return 403 remotely by default** — dsh upstream
   security design; deploying the remote-config proxy unlocks them on the
   phone (`docs/remote-config.md`).

## 3. Daily use

| Action | How |
|---|---|
| Open a session | ☰ drawer, tap the session (no keyboard pop-up; tap the input box to focus) |
| Send a message | Arrow button bottom-right (Enter inserts a newline) |
| Settings (URL/data/keep-awake) | ⚙ gear below ☰ (APK only) |
| Upload files | Same as the web (system file picker) |
| Download files | Saved to the system Downloads folder (with notification) |
| External links | Open in the system browser (the shell stays on the dsh domain) |
| Back | System back = page back; exits when there is no history |

## 4. Updates

Install the new APK over the old one. Debug and release builds use different
signatures — **do not mix them**: to upgrade from a debug build to a release
build, uninstall first.

## 5. Known limitations

- Configuration/credential pages (models, plugins, permissions, etc.) are
  computer-local by default (HTTP 403 remotely — dsh upstream security
  design); deploying the remote-config proxy unlocks them on the phone
  (`docs/remote-config.md`);
- The phone must keep Tailscale connected to reach the computer;
- "Clear cache & site data" also clears the internal-testing notice
  acknowledgement (it will prompt once more);
- Dark mode follows the system (the page reloads once when it switches).

## 6. Phone verification checklist

The in-app page is the same entry as the phone browser — see
`docs/tutorial.md` section 6. Two shell-specific items:

| Shell item | Expected behavior |
|---|---|
| ⚙ gear | Below ☰; tapping opens the native settings panel |
| Keep screen on | When enabled in settings, the screen stays on |
