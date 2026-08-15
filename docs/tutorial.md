# dsh Web Remote Access & Mobile Adaptation — from Zero (mobile-fit)

> 🌐 **Language**: English · [中文](tutorial.zh-CN.md)

> This guide is for **all users**: by the end you'll have dsh usable on both your PC and phone.
> For the project overview see the root `README.md`; developers should also read `pitfalls.md`.

---

## 0. Prerequisites

| Need | Notes |
|---|---|
| PC | Windows / macOS / Linux with Node.js (≥22) installed |
| dsh | `npx @deepseek-ai/dsh web` starts successfully (default `127.0.0.1:3080`) |
| Phone (optional) | Android / iOS with the [Tailscale](https://tailscale.com/download) app (only needed for remote access) |
| Tailscale account (optional) | Free tier is fine; log the PC and phone into the **same account** |

> Local-only usage: PC + Node.js is enough — skip section 2.

---

## 1. Start dsh Web (manual)

**Option A: command line** (simplest)

```sh
npx @deepseek-ai/dsh web
```

Open `http://127.0.0.1:3080` in a browser — the official UI means success. Closing the window stops the service.

**Option B: repository script** (Windows)

Double-click `scripts/start-dsh.ps1` (or run it in a terminal). The script:

- runs node directly (no cmd.exe wrapper window);
- restarts the process **10 seconds after a crash** (watchdog);
- exits if the port is already in use (no double instances);
- logs to `~/.dsh/logs/dsh-web.log`.

> Either option works. **Autostart is not required** — starting manually every time is fine (see section 4).

---

## 2. Phone Remote Access (optional)

> Goal: open `https://<machine>.<tailnet>.ts.net/` in the phone browser to reach dsh on the PC.

### 2.1 Networking

1. Install Tailscale on the PC and log in; install the app on the phone and log into the **same account**;
2. Verify: `tailscale status` shows both devices (`100.x.y.z` IPs).

### 2.2 Enable Serve (one-time admin authorization)

```sh
tailscale serve --bg 3080
```

The first run prints `https://login.tailscale.com/f/serve?node=xxxx` — open it in a browser, click **Enable**, then re-run the command. `Serve started and running in the background` means success.

### 2.3 Configure the dsh trust fence

dsh's `/api` only allows loopback or hosts listed in `trustedHosts`. Edit `~/.dsh/profiles/web/cordis.patch.yml` (Windows: `%USERPROFILE%\.dsh\...`), creating it if missing:

```yaml
- id: connection
  config:
    trustedHosts: !!js "['<your-machine>.<your-tailnet>.ts.net', ...ctx.webRuntime.trustedHosts]"
```

- Use the domain shown by `tailscale serve status` for `<your-machine>.<your-tailnet>.ts.net`;
- ⚠️ `!!js` accepts a single YAML scalar only — **wrap the whole expression in double quotes**;
- dsh hot-reloads this file — **no restart needed**, effective within seconds.

### 2.4 Verify

On the phone browser (with the Tailscale app connected) open:

```
https://<your-machine>.<your-tailnet>.ts.net/
```

> ⚠️ Use the **domain**, not an IP: Tailscale Serve only issues TLS certificates for domain names.

---

## 3. Enable Mobile Adaptation (mobile-fit, optional but recommended)

Narrow screens automatically get the mobile layout (drawer navigation, session actions, input experience, full-screen settings, etc.).

### 3.1 Mount the plugin (junction; code changes apply immediately)

```powershell
$nm = "$HOME\.dsh\profiles\web\node_modules"
New-Item -ItemType Directory -Force $nm | Out-Null
cmd /c mklink /J "$nm\mobile-fit" "<repo-path>\mobile-fit"
```

> It's a junction, not a copy: after updating this repo, a page refresh picks up the changes.

### 3.2 Append the patch line

Append to `~/.dsh/profiles/web/cordis.patch.yml`:

```yaml
- insert:
    - id: mobile-fit
      name: 'mobile-fit'
```

### 3.3 Restart dsh web

The client plugin set is scanned at startup; hot reload does not add new plugin rows:

```powershell
schtasks /end /tn dsh-web    # if autostart is registered, the watchdog relaunches in ~10s
```

If autostart is not registered, just restart the dsh process.

### 3.4 Verify

On the phone: a ☰ button appears top-left; tapping it opens the drawer (session list directly, closed via × top-right or the scrim); Enter inserts a newline and the arrow button sends. The desktop (wide screens) is unchanged.

---

## 4. Optional: Autostart

> **Not required.** Skip it if you don't want it — starting manually (section 1) is perfectly fine. With autostart, dsh runs in the background after login with no windows.

### 4.1 Register the task (wscript + vbs; zero windows at login)

```powershell
$action = New-ScheduledTaskAction -Execute 'wscript.exe' `
  -Argument '"<repo-path>\scripts\start-dsh.vbs"'
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName 'dsh-web' -Action $action -Trigger $trigger -Settings $settings -Force
```

> Why wscript + vbs: running `powershell.exe -WindowStyle Hidden` directly from Task Scheduler does **not** honor the hidden flag at login and pops up blank windows (see `pitfalls.md` P25/P26).

### 4.2 Management commands

| Action | Command |
|---|---|
| View task | `Get-ScheduledTask -TaskName dsh-web` |
| Start now | `schtasks /run /tn dsh-web` |
| Restart | `schtasks /end /tn dsh-web` (watchdog relaunches in ~10s) |
| Disable autostart | `Unregister-ScheduledTask -TaskName dsh-web` |

> Tailscale is a system service and the serve config persists — it restores itself after reboot; nothing to do.

---

## 5. Full Uninstall (rollback to pre-deployment, no residue)

Run the steps you need; after all of them, no project residue remains:

```powershell
# 1. (if autostart was enabled) unregister the task
Unregister-ScheduledTask -TaskName dsh-web

# 2. Turn off serve (phone loses access immediately)
tailscale serve --https=443 off
tailscale serve status        # should show "No serve config"

# 3. Restore dsh config: revert cordis.patch.yml to its initial content (hot-reloaded, no restart)
#    remove the trustedHosts section and the mobile-fit insert section; restore to:
#    -------
#    # Your patch layer for this dsh profile, applied after every bundle layer:
#    []
#    -------

# 4. Remove the mobile-fit junction
Remove-Item "$HOME\.dsh\profiles\web\node_modules\mobile-fit"

# 5. Stop dsh web (if running): close its window, or schtasks /end /tn dsh-web
```

**Verify the rollback**: the phone can no longer open the address; local `http://127.0.0.1:3080` still works (dsh itself is untouched); `curl -H "Host: <any-tailnet-address>" http://127.0.0.1:3080/api/session.list` returns `403` (fence restored).

> The repo itself can stay (it affects nothing); delete the repo directory if you want — no background residue.

---

## 6. Mobile Verification Checklist

| Area | Expected behavior |
|---|---|
| Sidebar | ☰ opens the drawer → session list directly (no icon rail); close via × or scrim |
| Session rows | 44px rows; ⋯ menu works (rename/fork/archive) |
| Title / stats | Session title and the stats line scroll horizontally to reveal full content |
| Input | Enter inserts a newline (does not send); the arrow button sends; composer sits at the bottom; switching sessions never pops the keyboard (tap the box to focus) |
| Settings | Full-screen panel, horizontal tab strip on top, scrollable content |
| Internal-testing notice | Stops appearing after clicking "Continue" once |

---

## 7. Known Limitation (dsh upstream security design)

Configuration/credential interfaces (Models page, plugin config, permissions, agent presets, etc.) are **loopback-only**: remote access always gets HTTP 403 (the Models page shows an error; most other pages fail silently). This is dsh's upstream security design, not a project bug. To use them, open `http://127.0.0.1:<port>` in the browser on the machine running dsh.

Language/appearance in General settings don't depend on that plane and work fine remotely.

---

## 8. More Documents

| Document | Audience |
|---|---|
| [mobile-fit/README.md](../mobile-fit/README.md) | Developers: plugin internals, customization, known notes |
| [pitfalls.md](pitfalls.md) | Developers: pitfall log (users can skip) |
