# dsh Web Remote Access — from Zero (Web + APK)

> 🌐 **Language**: English · [中文](tutorial.zh-CN.md)

> **Audience**: all users. By the end you'll have dsh usable on both your PC
> and phone — web and APK, manual start or autostart, the token switch, and
> complete uninstall. Developers: see [pitfalls.md](pitfalls.md) and
> [development.md](development.md).

---

## 0. Prerequisites

| Need | Notes |
|---|---|
| PC | Windows / macOS / Linux with Node.js (≥22) |
| dsh | `npx @deepseek-ai/dsh web` starts (default `127.0.0.1:3080`) |
| Phone | Android (APK or browser) or iOS (browser only) |
| Tailscale account (optional) | Free tier; PC and phone on the **same account** (remote access only) |

> Local-only? PC + Node.js is enough — skip section 2.3.

---

## 1. Three choices first

| Choice | Options | Notes |
|---|---|---|
| Startup | A. manual / B. autostart | See 2.1 and 5; without B you start manually each time |
| Client | Web / APK | Web: section 2; APK: section 3; same entry point |
| Token | on / off | Only needed with the remote-config proxy, see 4.3 |

---

## 2. Web tutorial (from zero)

### 2.1 Start dsh Web

**Option A: command line** (simplest)

```sh
npx @deepseek-ai/dsh web
```

Open `http://127.0.0.1:3080` — the official UI means success. Closing the window stops the service.

> **Version & updates (important)**:
>
> - **Fixed-version mechanism**: the autostart script `start-dsh.ps1` prefers
>   the **globally installed** dsh (lookup order: global → npx cache → npx fetch).
>   So **reboots always run the same fixed version** — it never re-fetches from
>   the network; it only changes when you update manually. To confirm which
>   version the autostart runs, check `~/.dsh/logs/dsh-web.log` for
>   `starting dsh web (… bin: <path>)`.
> - **Update to the latest version manually** (run on the PC; one shot switches
>   both the local and the remote connection to the new version):
>   ```powershell
>   npm install -g @deepseek-ai/dsh@latest
>   schtasks /end /tn dsh-web    # if autostart is registered: watchdog relaunches with the new version in ~10s
>   ```
>   Without autostart, just restart the dsh process.
> - **Check the current version**: `dsh --version` (works right after the global
>   install; for the npx cache use `npx @deepseek-ai/dsh --version`).
> - ⚠️ **Do not** update via `npx --yes @deepseek-ai/dsh@latest web`: npx
>   re-fetches the package each time, which frequently blows the Node.js heap
>   (`JavaScript heap out of memory`, see pitfalls P37). The global install
>   happens once, then stays fixed and starts offline.

**Option B: repo script** (Windows)

Run `scripts/start-dsh.ps1` (double-click or terminal). It runs node directly
(no cmd.exe window), prefers the **globally installed** dsh (fixed version,
see "Version & updates" above; only falls back to the npx cache / npx fetch
when the global install is missing), restarts the process **10s after a crash**
(watchdog), exits if the port is busy (no double instances), and logs to
`~/.dsh/logs/dsh-web.log`.

### 2.2 Local verification

Open `http://127.0.0.1:3080` — the DeepSeek Harness UI loads.

### 2.3 Phone access (Tailscale)

Goal: the phone browser opens `https://<machine>.<tailnet>.ts.net/`.

1. **Networking**: install Tailscale on the PC and log in; install the app on
   the phone with the **same account**; verify with `tailscale status` (both
   devices visible as `100.x.y.z`).
2. **Enable Serve** (one-time admin authorization):

   ```sh
   tailscale serve --bg 3080
   ```

   The first run prints `https://login.tailscale.com/f/serve?node=xxxx` — open
   it and click **Enable**, then re-run the command until it reports
   `Serve started and running in the background`.
3. **Trust fence**: dsh's `/api` only allows loopback or `trustedHosts`.
   Edit `~/.dsh/profiles/web/cordis.patch.yml` (Windows:
   `%USERPROFILE%\.dsh\...`); create it if missing:

   ```yaml
   - id: connection
     config:
       trustedHosts: !!js "['<your-machine>.<your-tailnet>.ts.net', ...ctx.webRuntime.trustedHosts]"
   ```

   - Use the domain from `tailscale serve status`;
   - ⚠️ `!!js` accepts a single YAML scalar only — **wrap the whole expression in double quotes**;
   - The file hot-reloads — **no dsh restart needed**.
4. **Verify**: on the phone (Tailscale app connected) open
   `https://<your-machine>.<tailnet>.ts.net/`. **Use the domain, not an IP**
   (Serve only issues certificates for domains).

### 2.4 Mobile adaptation (mobile-fit, optional but recommended)

1. **Mount the plugin** (junction — code changes apply immediately):

   ```powershell
   $nm = "$HOME\.dsh\profiles\web\node_modules"
   New-Item -ItemType Directory -Force $nm | Out-Null
   cmd /c mklink /J "$nm\mobile-fit" "<repo-path>\mobile-fit"
   ```

2. **Append the patch row** to `~/.dsh/profiles/web/cordis.patch.yml`:

   ```yaml
   - insert:
       - id: mobile-fit
         name: 'mobile-fit'
   ```

3. **Restart dsh web** (the client plugin set is scanned at startup):

   ```powershell
   schtasks /end /tn dsh-web   # watchdog relaunches in ~10s if registered
   ```

4. **Verify**: ☰ drawer, Enter = newline (arrow sends), and **switching
   sessions never pops the keyboard**. Desktop wide screens are unaffected.

### 2.5 Web verification checklist

| Area | Expected behavior |
|---|---|
| Sidebar | ☰ opens the drawer → session list directly; close via × / scrim |
| Session rows | 44px rows; ⋯ menu works (rename/fork/archive) |
| Title / stats | Session title and stats line scroll horizontally |
| Input | Enter = newline; arrow sends; switching sessions never pops the keyboard |
| Settings | Full-screen panel, horizontal tabs, scrollable content |
| Notice | Stops appearing after clicking "Continue" once |

---

## 3. APK tutorial

The APK is a **native Android shell** (WebView container) for the dsh Web UI:
standalone icon, no browser, URL + Token on one screen. Phone: Android 8.0+ (API 26+).

### 3.1 Install

Build it on the PC or copy the APK to the phone (`adb install -r` or tap the
file). Allow "install unknown apps" on first install.

### 3.2 First run

1. Open the app → fill in two fields on one screen:
   - **Access URL**: the Tailscale address of the machine running dsh
     (`https://<machine>.<tailnet>.ts.net/`, `https://` optional);
   - **Token** (optional): required when the remote-config proxy has one
     (see 4.3). When filled, the WebView carries it and the proxy login page
     never appears;
2. Tap Connect → if Tailscale is not connected a yellow banner appears; it
   disappears once connected;
3. The UI is identical to the phone browser (mobile-fit fully applies).

### 3.3 Daily use

| Action | How |
|---|---|
| Open a session | ☰ drawer, tap the session (no keyboard pop-up; tap the input to focus) |
| Send a message | Arrow button bottom-right (Enter = newline) |
| Settings (URL/token/data/keep-awake) | ⚙ gear below ☰ (APK only) |
| Upload files | Same as the web (system file picker) |
| Download files | Saved to the system Downloads folder (with notification) |
| External links | Open in the system browser |
| Back | System back = page back; exits when there is no history |

### 3.4 Verification

Web checklist in 2.5 (same entry), plus shell items:

| Shell item | Expected behavior |
|---|---|
| ⚙ gear | Below ☰; opens the native settings panel |
| Keep screen on | When enabled, the screen stays on |

---

## 4. Remote configuration unlock (optional proxy)

**Purpose**: by default configuration/credential pages (models, plugins,
permissions, agent presets, API keys) are computer-local (remote 403 — dsh
upstream security design). A small reverse proxy lets **both the phone
browser and the APK edit configuration**.

**One-line principle**: dsh's trust fence decides purely from the Host header
string — the proxy rewrites Host to the loopback spelling and deletes Origin,
so the configuration plane passes the fence remotely. Details:
development.md.

### 4.1 Deploy the proxy (manual)

```powershell
cd <repo>\scripts
node remote-config-proxy.mjs
```

Defaults: listens on `127.0.0.1:3081`, forwards to `http://127.0.0.1:3080`.
The proxy binds **loopback only**.

### 4.2 Point serve at the proxy

```powershell
tailscale serve status                          # record current mounts
tailscale serve --bg 3081                       # root / -> 127.0.0.1:3081
tailscale serve status                          # verify; re-add /m if lost:
tailscale serve --bg --set-path /m http://127.0.0.1:3100
```

### 4.3 Token switch

The fence is not an authentication layer: **anyone who can reach the proxy
can change configuration.** The tailnet device identity is the primary
boundary; the token is a second factor (**optional**, recommended).

**Enable** (on the PC, once):

```powershell
setx DSH_PROXY_TOKEN <your-passphrase>    # persists for new processes
```

Then **restart the proxy**.

**Fixed passphrase** (e.g. `wang2004`) avoids re-login after reboots (cookie
lasts 1 year); the tradeoff is strength.

**Where to enter it**:

- **Phone browser**: the login page appears first — enter the passphrase
  (once per phone);
- **APK**: fill Token on the first-run screen or in ⚙ settings — the WebView
  never shows the login page.

**Change/disable**: `setx DSH_PROXY_TOKEN <new>` + restart the proxy to
invalidate all phones; unset the variable to disable the token entirely.

### 4.4 Load speedup

The proxy adds a one-year immutable cache header to `?rev=` bundle
responses — upstream serves bundles uncached without validators, so slow
links re-download everything every load. **Use normal browser mode**;
incognito cannot cache (cold start every time).

---

## 5. Autostart (optional)

### 5.1 dsh web

```powershell
$action = New-ScheduledTaskAction -Execute 'wscript.exe' `
  -Argument '"<repo>\scripts\start-dsh.vbs"'
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName 'dsh-web' -Action $action -Trigger $trigger -Settings $settings -Force
```

> wscript + vbs: the hidden flag does not work when Task Scheduler runs
> powershell directly — a blank window would appear (pitfalls P25/P26).

### 5.2 Remote-config proxy (if deployed)

```powershell
$action = New-ScheduledTaskAction -Execute 'wscript.exe' `
  -Argument '"<repo>\scripts\start-remote-config-proxy.vbs"'
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName 'dsh-remote-config-proxy' -Action $action -Trigger $trigger -Settings $settings -Force
```

### 5.3 Management

| Action | Command |
|---|---|
| Inspect | `Get-ScheduledTask -TaskName dsh-web` |
| Start now | `schtasks /run /tn dsh-web` |
| Restart | `schtasks /end /tn dsh-web` (watchdog relaunches in ~10s) |
| Proxy: start now | `schtasks /run /tn dsh-remote-config-proxy` |
| Proxy: restart | `schtasks /end /tn dsh-remote-config-proxy` (watchdog relaunches in ~10s) |
| Disable | `Unregister-ScheduledTask -TaskName dsh-web` |

---

## 6. Complete uninstall (back to pre-deployment, no residue)

```powershell
# 1. (if autostart was enabled) unregister the tasks
Unregister-ScheduledTask -TaskName dsh-web
Unregister-ScheduledTask -TaskName dsh-remote-config-proxy

# 2. Turn serve off (phone loses access immediately)
tailscale serve --https=443 off
tailscale serve status        # should say No serve config

# 3. Restore cordis.patch.yml to its initial content (hot-reloads):
#    remove the trustedHosts and mobile-fit insert sections, back to:
#    # Your patch layer for this dsh profile, applied after every bundle layer:
#    []

# 4. Remove the mobile-fit junction
Remove-Item "$HOME\.dsh\profiles\web\node_modules\mobile-fit"

# 5. Stop dsh web and the proxy (close their windows, or schtasks /end /tn ...)
```

**APK**: Settings → Apps → DSH Remote → Uninstall (or `adb uninstall dev.dsh.remote`).

**Verify**: the phone can no longer open the address; `http://127.0.0.1:3080`
still works locally; `curl -H "Host: <any-tailnet-addr>" http://127.0.0.1:3080/api/session.list`
returns `403` (fence restored).

---

## 7. FAQ

| Symptom | Fix |
|---|---|
| Phone can't open the domain | Tailscale app connected (VPN icon)? Same account as the PC? |
| Want to use an IP | Not supported — use the domain |
| Can't connect after reboot | Tailscale starts with Windows; `tailscale serve status` shows running |
| Some features return 403 | Config/credential pages are 403 remotely by default (upstream design); deploy the proxy (section 4). If basic features also 403, `trustedHosts` is not effective (2.3) |
| Notice pops up every refresh | Stops after one "Continue" (mobile-fit persists it) |
| "Failed to load plugins" | mobile-fit not active: check junction + patch row, restart dsh (2.4) |
| Browser loads slowly (incognito) | Incognito cold-starts every time; use normal mode (4.4) |
| `tailscale` not found | Windows full path: `C:\Program Files\Tailscale\tailscale.exe` |
| `npx @deepseek-ai/dsh@latest web` fails with `JavaScript heap out of memory` | Update via the global install instead (see §2.1 "Version & updates"); don't use npx |
| Autostart still runs the old version after an update | `start-dsh.ps1` pins the global version; make sure `npm install -g @deepseek-ai/dsh@latest` ran, then `schtasks /end /tn dsh-web` so the watchdog relaunches the new version, or check the `bin:` path in the log |
| A cmd.exe window appears at startup | AMD graphics driver (`AMDRSServ.exe`), unrelated; safe to close |
| APK shows the proxy login page | Fill Token in ⚙ settings (4.3) |
| APK content hidden under the punch-hole | Built-in (content starts below the status bar); update the app |
