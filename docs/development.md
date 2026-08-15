# Project Structure & Development Guide

> 🌐 **Language**: English · [中文](development.zh-CN.md)

> **Audience**: developers / maintainers. Repository layout, the three
> components (mobile-fit / APK / remote-config proxy) and their internals,
> testing, and contributing. Users: [tutorial.md](tutorial.md); pitfalls:
> [pitfalls.md](pitfalls.md).

## 1. Repository layout

```
deepseek-harness-remote/
├── README.md / README.zh-CN.md        # intro + screenshots + quick start (points to tutorial)
├── docs/
│   ├── tutorial.md / tutorial.zh-CN.md      # all users: from zero to remote control (web + APK)
│   ├── pitfalls.md / pitfalls.zh-CN.md      # developers: pitfall log (P1–P34)
│   └── development.md / development.zh-CN.md # this file
├── mobile-fit/                        # dsh Web mobile adaptation plugin (client package)
│   ├── lib/client.js                  # hand-written client bundle (no build chain)
│   ├── lib/index.js                   # empty node half
│   └── test/                          # shape / interaction / focus / proxy-coop tests
├── apk/                               # Android shell (zero-dependency Java)
│   ├── app/src/main/java/dev/dsh/remote/MainActivity.java  # the whole shell
│   ├── app/src/main/res/              # strings (zh/en), light theme, adaptive icon
│   └── build.gradle.kts               # minSdk 26 / targetSdk 35 / release signing
├── scripts/
│   ├── start-dsh.ps1 / .vbs           # dsh web watchdog + zero-window launch
│   ├── remote-config-proxy.mjs        # the proxy (zero dependencies)
│   ├── start-remote-config-proxy.ps1 / .vbs
│   ├── test-remote-config-proxy.mjs   # proxy smoke test (23 assertions)
│   ├── measure-latency.mjs            # direct vs proxy per-hop latency
│   └── install-apk.ps1                # one-shot APK install
├── assets/                            # README screenshots
└── deepseek-harness-master/           # upstream dsh source for reference (gitignored)
```

**Core principles**: pure overlay — no dsh source changes; adapt when upstream
changes; zero-dependency first.

## 2. mobile-fit (mobile web adaptation plugin)

### How it works

Injected through the official client-plugin seam (`dsh.client` manifest +
`exports["./client"]`); the bundle is a hand-written
`window.__ModuleLoader__.load({id, factory})` classic module — no tsdown
chain; edits apply on page refresh (the rev is re-hashed per request).

### Capabilities

Drawer sidebar (☰ → expanded content, ×/scrim close, pre-expanded at load);
session actions (44px rows, ⋯ menu, full-screen dialogs); input experience
(Enter = newline, 16px anti-zoom, **no keyboard pop-up on session switch**);
full-screen settings; notice persistence via localStorage; APK shell bridge
(`window.DshShell` → ⚙ gear); proxy cooperation (flips
`connection.isLoopback` under `window.__DSH_PROXY__`).

### Customization

Edit `lib/client.js`: the `css` string (media-query rules; substring matching
for multi-class elements — pitfalls P14); drawer interaction; startup tweaks;
listeners (MutationObservers, click capture, composer focus suppression);
the `apply` patch (proxy loopback flip, ordered by `exports.inject =
['connection']` plus the proxy's manifest reorder).

### Tests

```sh
node mobile-fit/test/bundle-shape.mjs     # plugin shape (apply + inject)
node mobile-fit/test/focus-suppress.mjs   # focus suppression, 8 scenarios
node mobile-fit/test/shell-gear.mjs       # DshShell gear
node mobile-fit/test/proxy-apply.mjs      # proxy loopback flip
```

### Known notes

Selectors use stable semantic class suffixes and `data-slot` names — the
build-hash prefix changes per version (**regression-check after upstream
upgrades**); the details column is hidden on phones; all enhancements are
invisible in a plain browser.

## 3. APK (Android shell)

### Layout

`apk/app/src/main/`: AndroidManifest (permissions, adjustResize, edge-to-edge
opt-out), `MainActivity.java` (the whole shell, zero third-party deps),
`res/` (bilingual strings, light theme, adaptive icon).

Key features: WebView container (JS/DOM storage/cookies); URL + Token on one
setup screen (token pre-set into the cookie so the login page never shows);
Tailscale VPN banner (live NetworkCallback); file upload/download bridges;
error screen with retry; `DshShell` JS bridge; keep-screen-on; light chrome.

### Build & install

```powershell
cd apk
.\gradlew.bat assembleDebug          # first run downloads Gradle + AGP deps
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

Or: `powershell -File scripts\install-apk.ps1 -Type debug`.

**Release signing**: `apk/keystore.properties` (gitignored) carries the
keystore (absolute `storeFile` + passwords); generate with JDK `keytool`
(`-alias dsh-remote -keyalg RSA -keysize 2048 -validity 10950`). Without the
file the release build succeeds unsigned.

> Debug and release signatures differ — do not install one over the other.

### Known limitations

Config/credential pages are 403 remotely by default (upstream design; the
proxy unlocks them); Tailscale must stay connected; "clear cache & site
data" resets the notice acknowledgement; the app chrome is light-styled.

## 4. remote-config proxy (remote configuration unlock)

### Principle (source-verified)

The dsh trust fence (`packages/client/connection/src/api-request-trust.ts`,
`rpc-host.ts`) decides **purely from the Host header string** and refuses a
present-but-mismatched Origin. Rewriting Host to `127.0.0.1:<target>` and
deleting Origin passes the fence for regular `/api`, the privileged-method
check (`PRIVILEGED_METHODS`), and the WebSocket upgrades.

### Second layer: the client-side loopback check

The plugin-config cards stay invisible even with the server fence unlocked:
the frontend's `connection.isLoopback` comes from `location.hostname`, and a
non-loopback page falls back to memory persistence with no RPCs
(`settings-scope.ts`). Fix = proxy + mobile-fit cooperation: inject
`window.__DSH_PROXY__`; reorder the `__DSH_BOOT__` manifest (mobile-fit right
after the connection row, with an inject edge); mobile-fit exports
`inject: ['connection']` and flips `isLoopback` in `apply`.

**Regression-check after upstream upgrades**: the manifest row ids and the
connection plugin id are the patch points.

### HTML rewriting

text/html responses (uncompressed) are buffered and rewritten: proxy flag +
manifest reorder (idempotent parse → modify → stringify).

### Token gate

With `DSH_PROXY_TOKEN` set, `/login` serves a dsh-styled mini login page
(light/dark following the system) and issues an
`HttpOnly; SameSite=None; Secure` cookie (1 year); every request (upgrades
included) must carry it. **SameSite=None+Secure is required** — Chromium does
not send Lax cookies on WebSocket handshakes (pitfalls P35).

### Bundle caching

`?rev=` bundle responses get `Cache-Control: public, max-age=31536000,
immutable` — upstream serves no-cache without validators, so slow links
re-download everything per load; the rev is a content hash, so immutable
caching is safe.

### Diagnostics

`DSH_PROXY_DIAG=1` injects a "copy diagnostics" button (navigation timing,
slow resources, WS open latencies, first-session-row time); remove the env
var and restart to turn it off.

### Security boundary

Loopback-only bind; tailnet identity is the authentication, the token is the
second factor; **never** `tailscale funnel`; the proxy extends
"in-front-of-the-PC" privileges to the tailnet — use at your own risk.

### Tests

```sh
node scripts/test-remote-config-proxy.mjs   # 23 assertions: Host rewrite, Origin
                                            # deletion, token flow, WS relay, HTML rewrite
node scripts/measure-latency.mjs            # direct vs proxy timing (proxy adds none)
```

## 5. Testing & device verification

Unit/smoke tests per component above; on-device verification via the
tutorial checklists; debug builds enable `chrome://inspect` for the
WebView; after upstream dsh upgrades, regression-check mobile-fit
selectors, the manifest reorder and the proxy rewrites.

## 6. Contributing

Contributions are welcome — issues and pull requests, even the smallest fix.
Before developing, read:

- [pitfalls.md](pitfalls.md) — root causes and fixes for every known issue;
- this file — structure and component internals;
- house rules: **record every new pitfall in pitfalls immediately**; keep
  docs bilingual; scripts delivered to Windows PowerShell 5.1 must be pure
  ASCII (pitfalls P1).
