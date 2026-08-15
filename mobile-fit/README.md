# mobile-fit (dsh Web Mobile Adaptation Layer)

> 🌐 **Language**: English · [中文](README.zh-CN.md)

> **Audience**: this file is for **developers / maintainers**. Users who only use the mobile web UI should see `docs/tutorial.md` (deployment & enablement) and `docs/pitfalls.md` (pitfall log).
>
> **Status**: ✅ usable (daily mobile use; continuously polished). Adapts the **official dsh Web UI** for phones: same UI, no upstream changes — it injects mobile CSS and a little interaction through the official client-plugin seam. **No source dsh modifications needed**; the package adapts when upstream dsh changes.

## Capabilities

- **Sidebar drawer**: ☰ opens → the expanded sidebar content directly (no icon rail), closed via ×; the sidebar is pre-expanded at load so opening the drawer never flickers through a rail→expand transition;
- **Session actions**: 44px touch-height rows, always-visible ⋯ menu (rename/fork/archive), full-screen dialogs;
- **Input experience**: Enter inserts a newline (the arrow sends), 16px input prevents iOS zoom-on-focus, keyboard hints "newline", composer pinned to the bottom with safe-area padding;
- **Settings panel**: full-screen, nav becomes a horizontal tab strip, content scrolls; a bilingual **upstream-security banner** appears at the top under remote access (config/credential APIs are loopback-only);
- **Persistence**: the internal-testing notice stops appearing after one acknowledgement (localStorage; upstream keeps it in memory only for remote browsers);
- **Swipeable**: the stats line and the session title scroll horizontally to reveal full content;
- Desktop (wide >820px) is completely unaffected.

## How it works

```
Phone browser
   │  official frontend dist (dsh-web-frontend, untouched)
   ▼
window.__ModuleLoader__  ── loads /plugins/mobile-fit/client.js (injected by this package)
   │  ① <style> injection: @media (max-width:820px) mobile rules
   │  ② interaction: burger button + sidebar drawer + scrim + startup tweaks (pre-expand/notice persistence/Enter newline/banner)
   ▼
Official UI (React tree untouched)
```

Mounted exactly like official `dsh-client-ui-*` packages (`dsh.client` manifest + `exports["./client"]`); no tsdown build chain — the client bundle is a hand-written `window.__ModuleLoader__.load({id, factory})` classic module (same format as official bundles).

## Installation (once)

1. Put this package into the dsh web profile dependency tree:

   ```powershell
   $nm = "$HOME\.dsh\profiles\web\node_modules"
   New-Item -ItemType Directory -Force $nm | Out-Null
   cmd /c mklink /J "$nm\mobile-fit" "<repo-path>\mobile-fit"
   ```

   (A junction, not a copy — code changes apply immediately; `npm install <this dir>` also works, though `npx` dsh updates won't touch the profile.)

2. Append to `~/.dsh/profiles/web/cordis.patch.yml`:

   ```yaml
   - insert:
       - id: mobile-fit
         name: 'mobile-fit'
   ```

3. **Restart dsh web** (the client plugin set is scanned at startup; hot reload does not add new plugin rows):

   ```powershell
   schtasks /end /tn dsh-web   # watchdog relaunches in ~10s
   ```

## Verification

- Phone: open `https://<machine>.<tailnet>.ts.net/` (same entry as desktop)
- Behavior checklist: `docs/tutorial.md` section 6 (drawer, session actions, input, settings, notice, banner, etc.)
- Desktop browser: no change
- Regression: `node mobile-fit/test/bundle-shape.mjs` validates the plugin shape

## Customization

Edit `lib/client.js` — four blocks:

- The `css` string: mobile rules (inside the media query; use substring matching for multi-class elements — see `docs/pitfalls.md` P14);
- Drawer interaction: burger/scrim/`openDrawer`/`closeDrawer`;
- Startup tweaks: sidebar pre-expand (idempotent), notice persistence & silent dismissal, Enter-newline, security banner (bilingual);
- Observers & listeners: body-level/subtree MutationObservers, capture-phase click listener.

**Refresh the page after editing** (the `<style>` tag carries `data-plugin-css="mobile-fit/css"` and the bundle rev is re-hashed per request by client-modules); only new plugin rows require a dsh restart.

## Known notes

- **Plugin shape (important)**: the browser-side cordis loader applies the bundle's exports as a plugin, so it **must export `apply`** (a function or an object with an `apply` method); otherwise the page shows `Failed to load plugins ... invalid plugin, expect function or object with an "apply" method`. This package matches official bundles: `exports.apply = apply` (the injection runs at factory materialization). Validate with `node mobile-fit/test/bundle-shape.mjs`.
- Selectors use official semantic class suffixes (`[class$="_sidebarCol"]` etc.) and `data-slot` names; the build-hash prefix (e.g. `pI_x6G_`) changes per version while the semantic suffix is stable — **regression-check after upstream dsh upgrades**.
- The right details column is hidden on phones (`_detailsCol`); desktop is unaffected.
- **Remote-access limitation (upstream security design)**: config/credential APIs are loopback-only (localhost); remote domains get 403 — the Models page, plugin config, permissions, agent presets, etc. are unavailable; language/appearance in General still work. mobile-fit shows a bilingual banner at the top of the settings panel.
