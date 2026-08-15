// mobile-fit browser bundle: mobile UI adaptation for the dsh Web GUI.
// Loaded through the official client-plugin seam (dsh.client / exports["./client"]),
// exactly like @deepseek-ai/dsh-client-ui-* bundles. It injects a <style> with
// viewport-aware rules and a small drawer interaction (the drawer shows the
// expanded sidebar content directly — no icon rail); the host dsh process and
// the official frontend are untouched.
//
// Selector strategy: official class names are build-hashed (e.g. pI_x6G_sidebarCol),
// but the semantic suffix (sidebarCol/centerCol/detailsCol/dock/editor/...) is
// stable across builds, so rules match [class$="_suffix"] instead of full names.
// Design tokens use the official --dsw-* variables, which exist in the base theme.
window.__ModuleLoader__.load({
  id: "mobile-fit",
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;

    // ── CSS injection ────────────────────────────────────────────────────
    var css = [
      // Narrow screens: collapse the 3-column frame to a single column.
      "@media (max-width: 820px) {",
      "  html, body { overflow-x: hidden; }",
      "  [class$=\"_frame\"] { grid-template-columns: 1fr !important; }",
      "  [class$=\"_handle\"] { display: none !important; }",
      // Details column hides on phones; the conversation column takes over.
      "  [class$=\"_detailsCol\"] { display: none !important; }",
      // Sidebar becomes a slide-in drawer.
      "  [class$=\"_sidebarCol\"] {",
      "    position: fixed !important;",
      "    top: 0 !important; left: 0 !important; bottom: 0 !important;",
      "    width: min(84vw, 320px) !important;",
      "    z-index: 120 !important;",
      "    transform: translateX(-105%);",
      "    transition: transform 0.22s ease;",
      "    border-right: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.35));",
      "    box-shadow: 0 0 32px rgba(0,0,0,0.35);",
      "  }",
      "  body[data-mobile-fit-open] [class$=\"_sidebarCol\"] { transform: translateX(0); }",
      // Drawer open: the shell's panel toggle is replaced by the hosted close
      // control, and the expanded sidebar content fills the drawer — the
      // icon rail never appears on phones.
      "  body[data-mobile-fit-open] [class$=\"_sidebarCol\"] [class$=\"_toggle\"] { display: none !important; }",
      // The shell's inline width belongs to the desktop track; stretch the
      // column across the drawer and clear the top safe area. The marker
      // attribute is set by the interaction below on the exact column node.
      "  body[data-mobile-fit-open] [class$=\"_sidebarCol\"] [data-mobile-fit=\"expanded\"] {",
      "    width: 100% !important;",
      "    padding-top: max(6px, env(safe-area-inset-top, 0px)) !important;",
      "  }",
      // Safety net: while the drawer is open the rail controls may never
      // render, even in the brief collapsed frame before the expand lands.
      "  body[data-mobile-fit-open] [class$=\"_frame\"][data-sidebar-collapsed] [class$=\"_sidebarCol\"] [class$=\"_newSession\"],",
      "  body[data-mobile-fit-open] [class$=\"_frame\"][data-sidebar-collapsed] [class$=\"_sidebarCol\"] [class$=\"_regionArea\"],",
      "  body[data-mobile-fit-open] [class$=\"_frame\"][data-sidebar-collapsed] [class$=\"_sidebarCol\"] [class$=\"_footArea\"] { display: none !important; }",
      // Hosted close control: flows at the right end of the brand row inside
      // the drawer instead of floating over the content.
      "  #mobile-fit-burger.drawer-hosted {",
      "    position: static !important;",
      "    top: auto !important; left: auto !important;",
      "    z-index: auto !important;",
      "    background: transparent !important;",
      "    box-shadow: none !important;",
      "    color: var(--dsw-alias-label-secondary, #666) !important;",
      "    font-size: 18px !important;",
      "  }",
      // The native-shell gear (mobile-fit-gear) floats under the burger; the
      // open drawer's scrim covers the page, so the gear must go too.
      "  body[data-mobile-fit-open] #mobile-fit-gear { display: none !important; }",
      // The floating menu control would cover the session title; shift the
      // conversation header right on phones.
      "  [data-slot=\"conversation.session.header\"] [class$=\"_header\"] { padding-left: 56px !important; }",
      // Row actions are hover-only on desktop; phones have no hover, so pin
      // them visible and give the rows touch height. Substring matching:
      // rows carry varying trailing classes (selected/menuOpen/drop states),
      // so a suffix match would drop the rules the moment one is added —
      // the row would snap back to 32px and its menu button would vanish.
      "  [class*=\"_sessionRow\"], [class*=\"_projectRow\"] { height: 44px !important; }",
      "  [class*=\"_sessionRow\"] [class*=\"_rowActions\"],",
      "  [class*=\"_projectRow\"] [class*=\"_rowActions\"] { display: inline-flex !important; }",
      // Keep the relative time visible on phones (desktop hides it on row
      // hover and while the row menu is open — a tap triggers both).
      "  [class*=\"_sessionRow\"] [class*=\"_time\"] { display: inline !important; }",
      // Dialogs render as fixed layers under the drawer's transform; drop
      // the transform while one is open so they cover the viewport instead
      // of the drawer box (this also fixes rename/fork/workspace dialogs).
      // The transition goes off too: a transform transition would delay the
      // containing-block switch and flash the dialog inside the drawer box.
      "  body[data-mobile-fit-open] [class$=\"_sidebarCol\"]:has([class$=\"_mask\"]) {",
      "    transform: none !important;",
      "    transition: none !important;",
      "  }",
      // Settings shell on phones: full-viewport panel, the nav rail becomes
      // a horizontal strip, and the options get the width.
      "  [class$=\"_overlay\"] { align-items: stretch !important; }",
      "  [class$=\"_overlay\"] > [class$=\"_panel\"] {",
      "    box-sizing: border-box !important;",
      "    width: 100vw !important;",
      "    height: 100vh !important;",
      "    height: 100dvh !important;",
      "    max-width: none !important;",
      "    border-radius: 0 !important;",
      "    flex-direction: column !important;",
      "    padding-top: env(safe-area-inset-top, 0px) !important;",
      "  }",
      "  [class$=\"_overlay\"] [class$=\"_nav\"] {",
      "    flex: none !important;",
      "    flex-direction: row !important;",
      "    width: auto !important;",
      "    gap: 4px !important;",
      "    padding: 8px !important;",
      "    border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.35));",
      "  }",
      "  [class$=\"_overlay\"] [class$=\"_navTitle\"] { flex: none !important; align-self: center !important; padding: 0 8px !important; }",
      "  [class$=\"_overlay\"] [class$=\"_navList\"] { flex-direction: row !important; gap: 4px !important; overflow-x: auto !important; }",
      "  [class$=\"_overlay\"] [class$=\"_navCell\"] { flex: none !important; height: 36px !important; padding: 6px 12px !important; }",
      // Keep the settings options column as the constrained scroll container
      // on phones: the shell's content column lacks min-height: 0, so a
      // tall section would overflow the clipped panel and never scroll.
      "  [class$=\"_overlay\"] > [class$=\"_panel\"] > [class$=\"_content\"] {",
      "    flex: 1 1 0 !important;",
      "    min-height: 0 !important;",
      "  }",
      "  [class$=\"_overlay\"] > [class$=\"_panel\"] > [class$=\"_content\"] > [class$=\"_options\"] {",
      "    flex: 1 1 0 !important;",
      "    min-height: 0 !important;",
      "    overflow-y: auto !important;",
      "    padding: 12px 12px calc(12px + env(safe-area-inset-bottom, 0px)) !important;",
      "  }",
      // Composer: stick to the bottom, respect iPhone home indicator.
      "  [class$=\"_dock\"] {",
      "    padding-bottom: max(8px, env(safe-area-inset-bottom)) !important;",
      "  }",
      "  [class$=\"_editor\"] { font-size: 16px !important; }",
      // Touch targets: at least 44x44 CSS px.
      "  [class$=\"_iconButton\"], [class$=\"_action\"], [class$=\"_row\"], [class$=\"_toggle\"] {",
      "    min-height: 44px;",
      "  }",
      "  [class$=\"_iconButton\"], [class$=\"_toggle\"] { min-width: 44px; }",
      // Conversation column rows breathe on small screens. Scoped to the
      // center column: the sidebar column's own root also ends in "_root"
      // (and only matches when the pointer is inside, so the gap would
      // appear/disappear on every tap and shift the drawer content).
      "  [class$=\"_centerCol\"] [class$=\"_root\"] { gap: 10px; }",
      // Long content scrolls horizontally on phones instead of truncating:
      // the composer stats line and the session title breadcrumbs. The
      // crumbs need their 220px-per-segment cap lifted too — otherwise each
      // segment ellipsizes internally and the nav never overflows — and the
      // segments must not flex-shrink (min-width: 0 would let them compress
      // below their text, again leaving nothing to scroll).
      "  [data-slot=\"conversation.composer.dock\"] div[class$=\"_root\"] {",
      "    overflow-x: auto !important;",
      "    overflow-y: hidden !important;",
      "    text-overflow: clip !important;",
      "    scrollbar-width: none !important;",
      "  }",
      "  [data-slot=\"conversation.composer.dock\"] div[class$=\"_root\"]::-webkit-scrollbar { display: none !important; }",
      "  [data-slot=\"conversation.session.header\"] [class$=\"_crumbs\"] {",
      "    overflow-x: auto !important;",
      "    overflow-y: hidden !important;",
      "    scrollbar-width: none !important;",
      "    -webkit-overflow-scrolling: touch !important;",
      "    overscroll-behavior-x: contain !important;",
      "  }",
      "  [data-slot=\"conversation.session.header\"] [class$=\"_crumbs\"]::-webkit-scrollbar { display: none !important; }",
      "  [data-slot=\"conversation.session.header\"] [class*=\"_crumb\"] { max-width: none !important; }",
      "  [data-slot=\"conversation.session.header\"] [class$=\"_crumbSeg\"] { flex: none !important; }",
      "}"
    ].join("\n");

    var tagId = "mobile-fit/css";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
      var tag = document.createElement("style");
      tag.dataset.plugin = "mobile-fit";
      tag.dataset.pluginCss = tagId;
      tag.textContent = css;
      document.head.appendChild(tag);
    }

    // ── Drawer interaction ───────────────────────────────────────────────
    if (typeof document !== "undefined" && typeof window !== "undefined") {
      var BURGER_ID = "mobile-fit-burger";
      var SCRIM_ID = "mobile-fit-scrim";
      var SHELL_GEAR_ID = "mobile-fit-gear";
      var mq = window.matchMedia("(max-width: 820px)");
      var burger = null;
      var scrim = null;

      function closeDrawer() {
        document.body.removeAttribute("data-mobile-fit-open");
        if (scrim) { scrim.remove(); scrim = null; }
        if (burger) {
          // Back to the fixed top-left corner as the menu control.
          burger.classList.remove("drawer-hosted");
          document.body.appendChild(burger);
          burger.setAttribute("aria-label", "menu");
          burger.textContent = "\u2630";
        }
      }

      function openDrawer() {
        document.body.setAttribute("data-mobile-fit-open", "");
        // Host the burger at the right end of the brand row as the drawer's
        // close control, in place of the shell's panel toggle (hidden by CSS
        // while the drawer is open).
        var logoRow = document.querySelector('[class$="_sidebarCol"] [class$="_logoRow"]');
        if (logoRow !== null) {
          logoRow.appendChild(burger);
          // Mark the exact column node so CSS can stretch the expanded
          // content across the drawer (the shell's inline width is for the
          // desktop track). React leaves this attribute untouched.
          var sidebarRoot = logoRow.parentElement;
          if (sidebarRoot !== null) sidebarRoot.setAttribute("data-mobile-fit", "expanded");
        }
        burger.classList.add("drawer-hosted");
        burger.setAttribute("aria-label", "close");
        burger.textContent = "\u00d7";
        // The drawer shows the expanded sidebar content directly: if the
        // shell auto-collapsed the sidebar to its icon rail, drive the
        // rail's own expand toggle once.
        var frame = document.querySelector('[class$="_frame"]');
        if (frame !== null && frame.hasAttribute("data-sidebar-collapsed")) {
          var toggle = frame.querySelector('[class$="_sidebarCol"] [class$="_toggle"]');
          if (toggle !== null) toggle.click();
        }
        if (!scrim) {
          scrim = document.createElement("div");
          scrim.id = SCRIM_ID;
          scrim.style.cssText = [
            "position:fixed",
            "inset:0",
            "z-index:110",
            "background:rgba(0,0,0,0.4)"
          ].join(";");
          scrim.addEventListener("click", closeDrawer);
          document.body.appendChild(scrim);
        }
      }

      // ── Startup adjustments (mobile only) ──────────────────────────────
      // The shell auto-collapses the sidebar to its icon rail on narrow
      // screens; expand it once at load so the drawer always opens onto the
      // ready content, never a rail→expand transition. The frame's own
      // data-sidebar-collapsed attribute is the guard, and sidebarExpandTried
      // makes the click at-most-once: without the flag, the mutation observer
      // (fired by the scrim append while the drawer opens) could click the
      // same toggle a second time before React re-renders, expanding and
      // immediately collapsing — leaving an empty rail behind.
      var sidebarExpandTried = false
      function expandSidebarForMobile(attempt) {
        if (!mq.matches || sidebarExpandTried) return
        var frame = document.querySelector('[class$="_frame"]')
        if (frame === null) {
          // The React tree has not mounted yet; retry until it does.
          if (attempt < 40) setTimeout(function () { expandSidebarForMobile(attempt + 1) }, 150)
          return
        }
        sidebarExpandTried = true
        if (!frame.hasAttribute("data-sidebar-collapsed")) return
        var toggle = frame.querySelector('[class$="_sidebarCol"] [class$="_toggle"]')
        if (toggle === null) return
        toggle.click()
      }

      // Remote browsers persist nothing for the welcome notice (settings is
      // loopback-only, so upstream falls back to per-page memory and the
      // notice reopens on every load). Keep the acknowledgement here
      // instead. The key rides the upstream copy version: bump it when the
      // notice changes materially so it shows once more.
      var WELCOME_ACK_KEY = "mobile-fit:welcome-ack:2026-08-13.1"
      var welcomeHandled = false

      function welcomeLabel(button) {
        return (button.textContent || "").trim()
      }

      // Record the user's own acknowledgement (capture phase: fires before
      // the button's own handler, whatever the dialog's state).
      function recordWelcomeAck(event) {
        if (!(event.target instanceof Element)) return
        var button = event.target.closest("button")
        if (button === null) return
        var label = welcomeLabel(button)
        if (label === "\u7ee7\u7eed" || label === "Continue") {
          try { localStorage.setItem(WELCOME_ACK_KEY, "1") } catch (error) { /* storage unavailable */ }
        }
      }

      // Once acknowledged on an earlier visit, close the welcome dialog
      // without painting it: hide the card and drive its own continue
      // button (the onboarding step must complete so the app root un-inerts).
      function dismissWelcomeIfAcknowledged(attempt) {
        if (!mq.matches || welcomeHandled) return
        var acknowledged = false
        try { acknowledged = localStorage.getItem(WELCOME_ACK_KEY) !== null } catch (error) { /* storage unavailable */ }
        if (!acknowledged) return
        var dialogs = document.querySelectorAll('[class$="_dialog"]')
        for (var i = 0; i < dialogs.length; i++) {
          var buttons = dialogs[i].querySelectorAll("button")
          for (var j = 0; j < buttons.length; j++) {
            var label = welcomeLabel(buttons[j])
            if (label === "\u7ee7\u7eed" || label === "Continue") {
              welcomeHandled = true
              dialogs[i].style.display = "none"
              buttons[j].click()
              return
            }
          }
        }
        // The dialog may portal a moment after the app paints; retry briefly.
        if (attempt < 25) setTimeout(function () { dismissWelcomeIfAcknowledged(attempt + 1) }, 200)
      }

      // ── Composer behavior (mobile only) ────────────────────────────────
      // On phones Enter inserts a newline instead of sending (the arrow
      // button sends); IME composition and modified keys pass through.
      // Only propagation is stopped: the browser's native newline insertion
      // then proceeds untouched (cursor, draft, and input event stay
      // native), while the app's send handler never sees the keydown.
      function composerEnterToNewline(event) {
        if (!mq.matches || event.isComposing || event.key !== "Enter") return
        if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return
        var target = event.target
        if (!(target instanceof HTMLTextAreaElement)) return
        if (!target.matches('[class$="_input"]')) return
        event.stopPropagation()
      }

      // Tell the mobile keyboard the composer's Enter inserts a line break.
      function hintEnterKey() {
        if (!mq.matches) return
        var editor = document.querySelector('textarea[class$="_input"]')
        if (editor !== null && !editor.hasAttribute("enterkeyhint")) {
          editor.setAttribute("enterkeyhint", "enter")
        }
      }

      // Session switch (and first mount) returns focus to the composer by
      // script: upstream's unlock effect runs el.focus() whenever the active
      // session changes (InputBar's [locked, sessionId] effect). On phones
      // that raises the keyboard while the user only picked a conversation —
      // typing intent is a tap on the box itself. Script focus cannot be told
      // apart from a real tap by the event: the UA fires focus/focusin with
      // isTrusted=true even when script called focus() (the focusing steps
      // run internally, never a script dispatch), so isTrusted is useless
      // here. The reliable signal is the pointer that precedes the focus: a
      // pointerdown inside the composer is typing intent; anything else
      // (session row, drawer, onboarding dialog) is not. Three shapes count:
      // (1) the composer textarea itself (self-match, immune to ancestor
      // lookups), (2) the composer card [data-composer-card] — upstream
      // renders the dock slot as the card's FOOTER CHILD (a sibling of the
      // textarea branch, NOT an ancestor), so closest() from the textarea
      // can never find the dock slot and the send/tool buttons live in the
      // card too: their keep-focus refocus must stay allowed, (3) the dock
      // slot itself, for layouts where it does wrap the composer. Focus
      // within 1s of such a pointerdown is allowed — a real tap focuses in
      // that window, and the send button's keep-focus refocus rides a
      // mousedown inside the card — while any other composer focus is
      // refused. Chrome cancels focusin outright via preventDefault (no
      // keyboard flash); engines where focusin is not cancelable get the
      // blur() fallback.
      var lastDockPointerAt = 0
      function noteComposerPointer(event) {
        if (!mq.matches) return
        var target = event.target
        if (!(target instanceof Element)) return
        if (target.matches('textarea[class$="_input"]')) {
          lastDockPointerAt = Date.now()
          return
        }
        if (target.closest('[data-composer-card]') !== null) {
          lastDockPointerAt = Date.now()
          return
        }
        if (target.closest('[data-slot="conversation.composer.dock"]') !== null) {
          lastDockPointerAt = Date.now()
        }
      }
      function suppressScriptedComposerFocus(event) {
        if (!mq.matches) return
        var target = event.target
        if (!(target instanceof HTMLTextAreaElement)) return
        if (!target.matches('textarea[class$="_input"]')) return
        if (Date.now() - lastDockPointerAt < 1000) return
        event.preventDefault()
        target.blur()
      }

      // ── Native shell bridge (dsh-remote APK) ───────────────────────────
      // When hosted in the Android shell, window.DshShell exposes native
      // actions (currently openSettings). Add a gear button below the burger
      // that calls it; plain browsers have no bridge and see no gear.
      function ensureShellGear() {
        if (typeof window.DshShell === "undefined" || window.DshShell === null) return
        if (!mq.matches) return
        if (document.getElementById(SHELL_GEAR_ID) !== null) return
        var gear = document.createElement("button");
        gear.id = SHELL_GEAR_ID;
        gear.setAttribute("aria-label", "settings");
        gear.textContent = "\u2699";
        gear.style.cssText = [
          "position:fixed",
          "top:calc(64px + env(safe-area-inset-top, 0px))",
          "left:10px",
          "z-index:200",
          "width:44px",
          "height:44px",
          "border:none",
          "border-radius:12px",
          "background:var(--dsw-alias-button-floating-fill, rgba(128,128,128,0.2))",
          "color:var(--dsw-alias-label-primary, #333)",
          "font-size:18px",
          "line-height:1",
          "cursor:pointer",
          "box-shadow:0 1px 6px rgba(0,0,0,0.25)",
          "display:flex",
          "align-items:center",
          "justify-content:center"
        ].join(";");
        gear.addEventListener("click", function () {
          try { window.DshShell.openSettings(); } catch (error) { /* bridge went away */ }
        });
        document.body.appendChild(gear);
      }

      function ensureElements() {
        if (!mq.matches) { closeDrawer(); if (burger) { burger.remove(); burger = null; } return; }
        expandSidebarForMobile(0)
        dismissWelcomeIfAcknowledged(0)
        hintEnterKey()
        if (!burger) {
          burger = document.createElement("button");
          burger.id = BURGER_ID;
          burger.setAttribute("aria-label", "menu");
          burger.textContent = "\u2630";
          burger.style.cssText = [
            "position:fixed",
            "top:calc(10px + env(safe-area-inset-top, 0px))",
            "left:10px",
            "z-index:200",
            "width:44px",
            "height:44px",
            "border:none",
            "border-radius:12px",
            "background:var(--dsw-alias-button-floating-fill, rgba(128,128,128,0.2))",
            "color:var(--dsw-alias-label-primary, #333)",
            "font-size:20px",
            "line-height:1",
            "cursor:pointer",
            "box-shadow:0 1px 6px rgba(0,0,0,0.25)",
            "display:flex",
            "align-items:center",
            "justify-content:center"
          ].join(";");
          burger.addEventListener("click", function () {
            if (document.body.hasAttribute("data-mobile-fit-open")) {
              closeDrawer();
            } else {
              openDrawer();
            }
          });
          document.body.appendChild(burger);
        }
        ensureShellGear();
      }

      // The React tree may replace body children; re-assert our fixed layer.
      var observer = new MutationObserver(ensureElements);
      observer.observe(document.body, { childList: true, subtree: false });
      mq.addEventListener("change", ensureElements);
      document.addEventListener("click", recordWelcomeAck, true);
      document.addEventListener("keydown", composerEnterToNewline, true);
      document.addEventListener("pointerdown", noteComposerPointer, true);
      document.addEventListener("focusin", suppressScriptedComposerFocus, true);
      ensureElements();
    }

    // ── Plugin shape ─────────────────────────────────────────────────────
    // The browser-side cordis loader applies this module's exports as a
    // plugin: it must be a function or an object with an `apply` method
    // (plus an optional `inject` service list, exactly like official
    // bundles). The actual CSS/JS injection above runs at module-
    // materialization time, which the loader executes once per bundle rev.
    //
    // Behind the remote-config proxy the page authority is still the
    // tailnet domain, so the connection client reports isLoopback=false and
    // every settingsScope-bound surface (plugin config cards, model
    // settings, document controls) falls back to memory persistence — the
    // "plugin config invisible" symptom. The proxy injects
    // window.__DSH_PROXY__ and reorders this row in the boot manifest to
    // activate right after dsh-client-connection (hence the inject edge),
    // so this patch lands BEFORE the settings consumers bind their scopes.
    // Without the proxy flag nothing is touched.
    function apply(ctx) {
      if (typeof window === "undefined" || window.__DSH_PROXY__ !== true) return
      try {
        var connection = ctx.get("connection")
        connection.isLoopback = true
      } catch (error) { /* connection unavailable at apply time */ }
    }

    exports.apply = apply;
    exports.inject = ["connection"];
    return module.exports;
  }
});
