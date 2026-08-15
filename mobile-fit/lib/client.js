// mobile-fit browser bundle (M3): mobile UI adaptation for the dsh Web GUI.
// Loaded through the official client-plugin seam (dsh.client / exports["./client"]),
// exactly like @deepseek-ai/dsh-client-ui-* bundles. It injects a <style> with
// viewport-aware rules and a small drawer interaction; the host dsh process and
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
      // Conversation list rows breathe on small screens.
      "  [class$=\"_root\"] { gap: 10px; }",
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
      var mq = window.matchMedia("(max-width: 820px)");
      var burger = null;
      var scrim = null;

      function closeDrawer() {
        document.body.removeAttribute("data-mobile-fit-open");
        if (scrim) { scrim.remove(); scrim = null; }
        if (burger) burger.textContent = "\u2630";
      }

      function ensureElements() {
        if (!mq.matches) { closeDrawer(); if (burger) { burger.remove(); burger = null; } return; }
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
              document.body.setAttribute("data-mobile-fit-open", "");
              burger.textContent = "\u00d7";
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
          });
          document.body.appendChild(burger);
        }
      }

      // The React tree may replace body children; re-assert our fixed layer.
      var observer = new MutationObserver(ensureElements);
      observer.observe(document.body, { childList: true, subtree: false });
      mq.addEventListener("change", ensureElements);
      ensureElements();
    }

    return module.exports;
  }
});
