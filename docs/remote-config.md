# Remote configuration (remote-config proxy)

> 🌐 **Language**: English · [中文](remote-config.zh-CN.md)

> **Audience**: all users who want to edit **models, plugins, permissions,
> API keys from the phone** — in the phone browser and in the APK. One
> optional PC-side script unlocks it; web and APK share the same entry.

## One-line principle

dsh pins its configuration/credential plane (models, plugin config,
permissions, agent presets, `llm.discoverModels`) to **loopback**: the
trust fence decides purely from the **Host header string** (confirmed in
`packages/client/connection/src/api-request-trust.ts` and `rpc-host.ts`),
never from the source IP. A small reverse proxy rewrites the Host to the
loopback spelling and deletes the Origin header, so the whole plane passes
the fence for remote callers.

```
Phone browser / APK WebView
   │  both load https://<machine>.<tailnet>.ts.net/
   ▼
tailscale serve (443 → PC 127.0.0.1:3081)
   ▼
scripts/remote-config-proxy.mjs   (loopback only; rewrites Host, deletes Origin)
   ▼
dsh web @ 127.0.0.1:3080
```

Everything rides the same origin, so normal APIs, the WebSocket event
streams (`/api/events.mux`, `/api/events.host`), page assets and mobile-fit
all keep working unchanged.

## Why it works (from the dsh source)

- Every `/api` request passes `isTrustedApiRequest()` — a Host-header check
  (`localhost` / `[::1]` / any 127.x) plus "Origin, if present, must match
  the Host exactly".
- Privileged methods additionally pass the fence with an **empty** trust
  list: their Host must be a loopback spelling. Rewriting Host to
  `127.0.0.1:3080` satisfies that.
- The Origin header must be **deleted**, not rewritten: the browser sends
  `Origin: https://<tailnet domain>` on POSTs, which would mismatch the
  loopback Host and get refused by the Origin fence.
- WebSocket upgrades (`/api/events.mux`, `/api/events.host`) run the same
  fence on the handshake; the proxy relays the 101 verbatim and splices the
  sockets.

## Deploy

### 1. Start the proxy (manual first)

```powershell
cd <repo>\scripts
node remote-config-proxy.mjs
```

Defaults: listens on `127.0.0.1:3081`, forwards to `http://127.0.0.1:3080`.
Env overrides: `DSH_PROXY_PORT`, `DSH_PROXY_TARGET`, `DSH_PROXY_TOKEN`
(see Token gate below). The proxy binds **loopback only** — nothing on the
LAN can reach it directly.

### 2. Point tailscale serve at the proxy

```powershell
tailscale serve status                          # record the current mounts
tailscale serve --bg 3081                       # root / -> 127.0.0.1:3081
tailscale serve status                          # verify; re-add /m if lost:
tailscale serve --bg --set-path /m http://127.0.0.1:3100
```

### 3. Verify on the phone

Open `https://<machine>.<tailnet>.ts.net/` → settings → **Models / plugins /
permissions / API keys now load and save** (previously blank / 403).

## Token gate (optional but recommended)

The fence is explicitly not an authentication layer: **anyone who can reach
the proxy can change configuration.** The tailnet device identity is the
only boundary — unless you set a token:

```powershell
setx DSH_PROXY_TOKEN <long-random-string>     # persists for new processes
```

With the token set, the proxy serves a mini login page at `/login`; every
request (WebSocket upgrades included) must carry the HttpOnly cookie it
issues. The APK's WebView shares the same cookie, so you log in once per
phone. Rotate the token to invalidate all phones.

## Autostart (optional)

Follows the existing zero-window pattern (see tutorial section 4):

```powershell
$action = New-ScheduledTaskAction -Execute 'wscript.exe' `
  -Argument '"<repo>\scripts\start-remote-config-proxy.vbs"'
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName 'dsh-remote-config-proxy' -Action $action -Trigger $trigger -Settings $settings -Force
```

`start-remote-config-proxy.ps1` is a watchdog (10s restart, port-conflict
guard, logs to `~/.dsh/logs/remote-config-proxy.log`); the vbs wrapper
applies the hidden-launch flag (P25/P26).

## Smoke test

```powershell
node scripts\test-remote-config-proxy.mjs
```

Starts a mock target + the proxy and asserts: Host rewrite, Origin deletion,
cookie passthrough, the full token login flow, and the WebSocket 101/echo
relay (19 assertions).

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Settings pages still 403 | Proxy not running, or serve still points at 3080 — check `tailscale serve status` and the proxy log |
| Phone gets the login page you did not set | `DSH_PROXY_TOKEN` is set somewhere; log in or unset it |
| Page loads but sessions don't update live | WebSocket relay blocked — check the proxy log for `upgrade error`; restart the proxy |
| Model catalog loads but "discover models" fails | That method is in the loopback plane too — the proxy covers it; verify `settings.describe` via the smoke test path |
| Works in browser, not in APK | Same origin/cookie: log in once in the APK's WebView (⚙ gear → reopen, or clear data and reload) |

## Security boundary (read this)

- This proxy **deliberately extends computer-local privileges to the
  tailnet**: it is the equivalent of "the phone is in front of the PC".
- Keep it loopback-only (never bind it to LAN/WAN, never `tailscale funnel`
  it). The tailnet identity is the authentication; the token is the second
  factor.
- dsh upstream considers this plane loopback-only *until a real
  authentication layer exists* — the proxy is a personal-workflow feature,
  not a product change; no dsh source is touched.
- The mobile-fit "loopback-only" banner in the settings panel still shows —
  it is written for the no-proxy deployment and is harmless here.

## Layout

```
scripts/remote-config-proxy.mjs      the proxy (zero dependencies, ~230 lines)
scripts/test-remote-config-proxy.mjs smoke test (19 assertions)
scripts/start-remote-config-proxy.ps1 watchdog launcher
scripts/start-remote-config-proxy.vbs hidden-launch wrapper
docs/remote-config.md                this file
```
