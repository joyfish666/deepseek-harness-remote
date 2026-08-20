# Pitfall Log (Pitfalls)

> 🌐 **Language**: English · [中文](pitfalls.zh-CN.md)

> **Audience**: this file is for **developers / maintainers** (read before touching this project's code). Users who only want to use the project can skip it.
>
> **Rule**: read this file before modifying related code; append a new entry immediately whenever you hit a new pitfall.
> **Principles**: always find the **root cause**; when fixing, check whether the same pattern breaks **other scenarios** too; never patch a single symptom.

---

## 1. Windows / PowerShell Environment

| # | Pitfall | Root cause | Fix |
|---|---|---|---|
| P1 | `start-dsh.ps1` with Chinese comments fails to parse under Task Scheduler (Windows PowerShell 5.1) | PS 5.1 reads UTF-8-without-BOM files as ANSI (GBK); multibyte sequences swallow newlines | Keep scripts delivered to PS 5.1 **pure ASCII**; or save them as UTF-8 **with BOM** |
| P2 | JSON written by `Out-File -Encoding utf8` is rejected ("body is not JSON") | PS 5.1's `utf8` = with BOM; the BOM pollutes the first JSON byte | Write JSON with `[System.IO.File]::WriteAllText`; or strip the BOM manually |
| P3 | `curl -d "{\"a\":1}"` loses quotes in PowerShell; the server receives broken JSON | PowerShell quote-escaping when passing arguments to native programs | Always pass JSON bodies via `--data-binary "@file"` |
| P4 | `Set-Content -NoNewline` joins array elements into one line | `-NoNewline` does not add element separators | Pipe `@(...) \| Set-Content` (line by line); always re-parse `.env` after writing |
| P5 | Direct `git push` to GitHub gets connection reset | The network needs a proxy | Repo-level `git config http.proxy http://127.0.0.1:7890` (+https.proxy); don't touch the global config |

## 2. dsh Configuration & Hot Reload

| # | Pitfall | Root cause | Fix |
|---|---|---|---|
| P6 | `!!js` patch expression with a spaced array → dsh fails loudly at startup | dsh's `!!js` tag has `kind: "scalar"`; it accepts only a **single YAML scalar** | Wrap the whole JS expression in **double quotes as a string**: `trustedHosts: !!js "[...array...]"` |
| P7 | Changed `~/.dsh/profiles/web/cordis.patch.yml` and assumed a restart is needed | Profile patches are **hot-reloaded** by `watchUserPatches` (Cordis HMR) | Effective within seconds; but a **format error fails loudly** — back up before editing |
| P8 | `host.listDirectory` returns "needs the browse capability" | Directory picking is a seam: the native backend has no browse method; localhost resolves to native by default | Disable `directory-picker`(auto) in the patch and insert the **pair**: `directory-picker-browse` (host backend) + `ui-directory-picker-browse` (client surface) — host-only loses the client directory flow (side effect: desktop workspace picking becomes in-browser too) |
| P9 | Editing the profile patch can restart the dsh connection layer → established WebSockets all drop | HMR re-applies transactionally and rebuilds related plugin fibers | Consumers must **auto-reconnect** (exponential backoff); SSE writers must try/catch to avoid dead-client propagation |
| P10 | `session.search` reports "search is disabled: openAt never" | The web-app bundle defaults to `session-query-sqlite.openAt: never` (full-text search is opt-in) | Restate the whole line in the profile patch: `{path: ':memory:', openAt: first-search}` (lazy index on first search; hot-reload applies) |
| P36 | After switching to the browse backend, the "Add workspace" button and the "Add workspace…" menu entry disappear entirely (only the per-row "new session" + remains) | The directory-picker seam is a **plugin pair**: a host backend (`dsh-host-directory-picker-browse`, no client.js) plus a client surface (`dsh-client-ui-directory-picker-browse`, which fills ui-workspace's directory-flow slots). The auto picker mounts both at boot (`BACKEND_PACKAGES` + `SURFACE_PACKAGES`); with only the host row, the client's `directoryFlowAvailable` is always false and the add entry never renders | Insert both rows (see P8); new client plugin rows do **not** hot-reload (P7 holds only for existing rows) — restart dsh web (client-modules scans at startup) |

## 3. dsh Protocol

| # | Pitfall | Root cause | Fix |
|---|---|---|---|
| P11 | Session history renders "error undefined / 🔧 undefined" | `SessionEvent` payloads live in the **`data`** field: `data.content`, `data.message.content`, `data.chunk.text`, `data.name`, `data.arguments`, `data.error`; the top level only has `type/seq/time` | Always read `ev.data.*`; never guess fields at the top level |
| P12 | `/api/workspaces/archiveSession` returns 404 | Wire paths = **full dotted method names**: `/api/workspace.archiveSession` (`session.list` → `/api/session.list`) | Build paths directly from the method name |
| P13 | `session.prompt` content starting with `/` is a slash command and doesn't consume the model | Official semantics | UI can hint "(/ starts a command)"; no special handling needed |

## 4. UI / Frontend (incl. mobile adaptation)

| # | Pitfall | Root cause | Fix |
|---|---|---|---|
| P14 | Tapping ⋯ on a session row: height snaps 44→32px, the ⋯ button vanishes, the list jumps (looks like a UI reload) | Rows carry multiple classes (`sessionRow selected menuOpen …`); `[class$="_sessionRow"]` suffix matching only hits when that name is the LAST class — adding `selected`/`menuOpen` breaks the rule | Use **substring matching** `[class*="_sessionRow"]` for multi-class elements; or add your own data attribute (`data-mobile-fit="expanded"`) |
| P15 | Hard-coded official class names break after dsh upgrades | Build hashes (e.g. `pI_x6G_`) change per version; semantic suffixes are stable | Depend only on semantic suffixes `[class$="_suffix"]` and `data-slot="<slot-name>"`; regression-check after upstream upgrades |
| P16 | Settings panel / dialogs get confined to the 320px drawer box and flash not-full-screen | The drawer's `transform` makes it the **containing block** for fixed descendants; the transform transition delays the containing-block switch | Temporarily set `transform: none` on the drawer while a dialog is open (`:has([class$="_mask"])`) plus `transition: none` (otherwise the dialog flashes inside the drawer box during the transition) |
| P17 | Models page 403; plugin-config/permissions/agent-presets blank (remote access) | dsh pins the settings/credentials plane to **loopback**; remote domains always get 403 and most surfaces swallow the error silently (`catch { return }`) | **Upstream security design — do not bypass by default**; deploying the remote-config proxy (`development.md` section 4) unlocks it |
| P18 | Internal-testing notice pops up on every refresh (remote access) | Upstream persists the acknowledgement in **memory** for remote (non-loopback) browsers | mobile-fit adds localStorage persistence (key bound to the upstream notice version; bump the key when the copy changes to prompt once more) |
| P19 | The load-time "pre-expand" cancels out the user's drawer-open expand → drawer is blank except × | Opening the drawer mounts the scrim, which fires the MutationObserver → the expand logic clicks the same toggle again before React re-renders (expand then collapse) | Make the expand action **at-most-once per load** (idempotent flag); every observer-triggered action must be idempotent |
| P20 | Intercepting Enter for newline: no send, but no newline either, cursor disappears until the next character | `setRangeText` does not fire the `input` event on iOS Safari, so the controlled draft never updates and the cursor is lost | Intercept with `stopPropagation()` only — **no** `preventDefault()` / manual text insertion: let the browser insert the newline natively (cursor/draft/input event all native) while React's send handler never sees the key |
| P27 | Switching sessions on the phone auto-focuses the composer and raises the keyboard | Upstream InputBar's unlock effect runs `el.focus()` on mount / sessionId change (desktop habit: select a session and type); on phones the keyboard pops with no gesture involved. **Pit within the pit**: focus/focusin fired by script `focus()` still carry `isTrusted === true` (the UA's internal focusing steps run, not a script `dispatchEvent`), so **isTrusted cannot tell user taps from script focus** (the first fix failed on exactly this) | Key on the **pointer trail** instead: a `pointerdown` inside the composer within 1s is typing intent (allowed — a real tap and the send button's keep-focus refocus both land in that window); any other composer focus is `preventDefault()`ed (Chrome cancels the focus outright, no keyboard flash) plus a `blur()` fallback (engines where focusin is not cancelable). **Layout pit**: upstream renders `conversation.composer.dock` as the InputBar card's footer — a *sibling* of the textarea branch, so `closest('[data-slot=…composer.dock]')` from the textarea can never match, and the send/tool buttons sit in the card too. The guard therefore matches three shapes: the composer textarea itself (self-match), the `[data-composer-card]` ancestor, or the dock slot (for layouts where it wraps the composer) |

## 5. Deployment / Tailscale

| # | Pitfall | Root cause | Fix |
|---|---|---|---|
| P21 | `tailscale serve` first use: "Serve is not enabled on your tailnet" | Tailscale safety switch; needs one web authorization | Enable via the `https://login.tailscale.com/f/serve?node=…` link the terminal prints |
| P22 | `https://<tailnet-ip>/` won't open (TLS alert / schannel doesn't support IP SNI) | This Serve version issues certificates only for **MagicDNS domains**; Windows schannel sends no SNI for IPs | Always use `https://<machine>.<tailnet>.ts.net/`; test with Node/curl, not schannel |
| P23 | Autostart tasks must prevent double instances | The user may have started manually at login | The autostart script checks port usage (`Get-NetTCPConnection -LocalPort`) before starting |
| P24 | Phone keyboard Enter "sends" while users expect a newline | Desktop habit (Enter = send) conflicts with mobile keyboards | On mobile, Enter always inserts a newline; sending goes through the button only (design decision, not a bug) |
| P25 | Two **blank powershell.exe windows** pop at login (every reboot) | The task Action runs `powershell.exe -WindowStyle Hidden -File …` directly: **SW_HIDE is not honored in the Task Scheduler login scenario**, so the watchdog console is created and shown (title = process path; blank because output is redirected to logs) | Wrap the task Action with **`wscript.exe` + `.vbs`** (`WshShell.Run "powershell … -File …", 0, False` — SW_HIDE applied by wscript) → zero windows at login. ⚠️ Never run `taskkill /T` against a hosted WindowsTerminal/console — the service processes (dsh) hosted inside it get killed too and 3080 dies |
| P26 | `-WindowStyle Hidden` powershell still pops a window (same family as P25) | Same as above: STARTF_USESHOWWINDOW handling at Task Scheduler startup differs from interactive shells | Same: always use the vbs wrapper; update an existing task with `schtasks /change /tn <task> /tr "wscript.exe …\xxx.vbs"` |

## 6. Methodology (lessons learned)

1. **Find the root cause**: symptom → reproduce → confirm against protocol/source → fix → regression. Never settle for "looks right".
2. **Check laterally**: when one scenario breaks, check whether the same field/pattern breaks elsewhere (e.g. P11's `data.*` issue affects both history and live events, all event types).
3. **Quantify performance problems first**: measure the data volume (event counts, message sizes) before choosing a fix.
4. **Zero-dependency first**: prefer Node built-ins over npm packages; lowest deployment and maintenance cost.
5. **Secure by default**: authentication, rate limiting, auditing, and directory constraints (out-of-bounds 403) are defaults, not options.

## 7. Android shell (apk/)

| # | Pitfall | Root cause | Fix |
|---|---|---|---|
| P28 | Crash on minSdk 26 devices (`NoSuchMethodError: String.isBlank`) | `String.isBlank()` is a Java 11 API available since API 33; AGP does no core-library desugaring by default | Always use `trim().isEmpty()`; check for high-API methods before committing (IDE lint / API diff) |
| P29 | `services.gradle.org` resets mid-download (`curl: (56)`); the proxy 127.0.0.1:7890 downloads instantly | This network is unreliable to that domain (same cause as P5) | Point the wrapper `distributionUrl` at `https://mirrors.cloud.tencent.com/gradle/...` (verified reachable); or resume with `curl -C - -x http://127.0.0.1:7890` |
| P30 | `gradlew` distribution download stalls at a 0-byte `.part` while curl/.NET reach the same URL | The wrapper's Java HTTP stack has a connection issue with the mirror CDN (proxy/redirect differences) | Pre-seed the wrapper cache: unzip the zip into `~/.gradle/wrapper/dists/<name>/<hash>/` and create the `.ok` file (the wrapper skips downloading); build locally with the unzipped gradle |
| P31 | `gradle wrapper` fails: "repository 'maven' was added by initialization script" | The machine's global `~/.gradle/init.gradle` (Aliyun mirrors) adds project repositories, conflicting with `repositoriesMode = FAIL_ON_PROJECT_REPOS` in settings | Drop `FAIL_ON_PROJECT_REPOS` in this project (the init-script mirrors help on CN networks); do not edit the global init.gradle |
| P32 | `gradlew.bat` returns exit code 1 from PowerShell although the log says "BUILD SUCCESSFUL" | gradlew.bat forwards javac stderr ("Note: ... uses or overrides a deprecated API"), and PowerShell treats native stderr as NativeCommandError | Judge success by the `BUILD SUCCESSFUL/FAILED` line, not the exit code; handle javac deprecation notes separately with `-Xlint:deprecation` |

## 8. Remote-config proxy

| # | Pitfall | Root cause | Fix |
|---|---|---|---|
| P33 | Config APIs still 403 after the proxy rewrites Host | Chrome sends an **Origin header even on same-origin POSTs/fetches**; once Host is rewritten to loopback, the Origin no longer matches and the Origin fence refuses (`api-request-trust.ts`: a present Origin must match the Host exactly) | The proxy must **delete the Origin header** (not rewrite it) — with Origin absent the fence passes outright |
| P34 | Page works through the proxy but the session event stream (WS) is dead | `http.request` does not handle Upgrade by default; the forwarding request must explicitly keep `Connection: Upgrade` + `Upgrade: websocket` (node strips hop-by-hop), the 101 must be hand-written and relayed via `res.rawHeaders` (preserving `Sec-WebSocket-Accept` etc.), then both sockets piped | See `server.on('upgrade')` in `scripts/remote-config-proxy.mjs`: `agent: false` + explicit headers + hand-written 101 + bidirectional `pipe` + error guards on both sockets |
| P35 | With the token gate on, the phone browser's WS upgrades are all denied (`cookie=null`) while fetches work; the connection controller retries every ~10s and the page never settles | Chromium **does not send `SameSite=Lax` cookies on WebSocket handshakes** (the WS cookie path differs from fetch); the Lax cookie from the login page never reaches the proxy's upgrade check | Issue the login cookie as **`SameSite=None; Secure`** (the documented combination that rides WS upgrades; the page is HTTPS so Secure is fine); the APK's `CookieManager.setCookie` carries the same attributes |
| P36 | After upgrading dsh to rc.8, `window.__ModuleLoader__` is now a queued facade (`{mode, pendingQueue, load, create}`) instead of a direct `{load}` object | dsh rc.8 introduced a two-phase boot: the HTML facade queues `load()` calls until `create()` materializes the module system (see `packages/client/modules/src/index.ts`) | **No action needed** — the `load({id, factory})` signature is unchanged; the facade queues registrations transparently. If writing custom boot code, call `load()` before `create()`, not after |
