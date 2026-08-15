# mobile-fit（dsh Web 移动端适配层）

> **读者**：本文件面向**开发者 / 维护者**；仅使用手机网页端功能的用户请看
> `docs/tutorial.md`（部署与启用）与 `docs/pitfalls.md`（踩坑记录）。
>
> **状态**：✅ 已可用（手机日常使用，持续打磨中）。给 **dsh 官方 Web 界面**做手机
> 适配：不换界面、不改上游，只通过 dsh 官方 client 插件 seam 注入移动端 CSS 与
> 少量交互。**无需修改源 dsh 代码**；上游 dsh 源码更新后本包会同步适配。

## 能力一览

- **侧栏抽屉**：☰ 打开 → 直接显示展开的侧边栏内容（无图标收纳栏），× 关闭；
  加载时预展开侧栏，打开抽屉零切换闪烁；
- **会话操作**：行高 44px 触控标准，⋯ 菜单常驻可见（重命名/分叉/归档），
  弹窗全屏正常显示；
- **输入体验**：Enter 换行（箭头发送）、16px 防 iOS 聚焦缩放、键盘提示"换行"、
  输入区贴底 + 安全区适配；
- **设置面板**：全屏化、导航变顶部横向标签、内容可滚动；远程访问时顶部显示
  **上游安全设计说明横幅**（配置/凭据接口仅限本机回环，中英双语跟随界面语言）；
- **持久化**：内测声明首次确认后不再弹出（localStorage，上游在远程浏览器下
  仅内存保存）；
- **可滑动**：底部统计栏与会话标题左右滑动查看完整内容；
- 电脑宽屏（>820px）完全不受影响。

## 工作原理

```
手机浏览器
   │  官方前端 dist（dsh-web-frontend，未改动）
   ▼
window.__ModuleLoader__  ── 加载 /plugins/mobile-fit/client.js（本包注入）
   │  ① <style> 注入：@media (max-width:820px) 移动端规则
   │  ② 交互：汉堡按钮 + 侧栏抽屉 + 遮罩 + 启动调整（预展开/声明持久化/Enter 换行/提示横幅）
   ▼
官方 UI（React 树原样）
```

挂载方式与官方 `dsh-client-ui-*` 包完全一致（`dsh.client` 声明 + `exports["./client"]`），
不需要 tsdown 构建链——client bundle 是手写的 `window.__ModuleLoader__.load({id, factory})`
经典模块（官方同款格式）。

## 安装（一次）

1. 把本包放进 dsh web profile 的依赖树：

   ```powershell
   $nm = "$HOME\.dsh\profiles\web\node_modules"
   New-Item -ItemType Directory -Force $nm | Out-Null
   cmd /c mklink /J "$nm\mobile-fit" "<仓库路径>\mobile-fit"
   ```

   （junction 而非复制，改本目录代码即生效；也可以 `npm install <本目录>`，但 npx 更新
   dsh 时不会动 profile，两种都行。）

2. 在 `~/.dsh/profiles/web/cordis.patch.yml` 末尾追加：

   ```yaml
   - insert:
       - id: mobile-fit
         name: 'mobile-fit'
   ```

3. **重启 dsh web**（client 插件集合在启动时扫描，热重载不会新增插件行）：

   ```powershell
   schtasks /end /tn dsh-web   # 看门狗 10 秒后自动拉起
   ```

## 验证

- 手机打开 `https://<机器名>.<tailnet>.ts.net/`（与电脑同一入口）
- 行为清单见 `docs/tutorial.md` 第 6 节（抽屉、会话操作、输入、设置、声明、横幅等）；
- 电脑浏览器无变化
- 回归可用 `node mobile-fit/test/bundle-shape.mjs` 验证插件形状

## 自定义

编辑 `lib/client.js`，分四块：

- `css` 字符串：移动端规则（媒体查询内；多类名元素用子串匹配，见
  `docs/pitfalls.md` P14）；
- 抽屉交互：汉堡按钮/遮罩/`openDrawer`/`closeDrawer`；
- 启动调整：预展开侧栏（幂等）、内测声明持久化与静默关闭、Enter 换行、
  安全提示横幅（中英双语）；
- 观察器与监听：body 级/子树级 MutationObserver、点击捕获监听。

改完**刷新页面即生效**（`style` 标签带 `data-plugin-css="mobile-fit/css"`，bundle rev
由 client-modules 每次请求重新哈希）；新增插件行才需要重启 dsh。

## 已知说明

- **插件形状（重要）**：浏览器端 cordis loader 会把 client bundle 的 exports 当作
  插件应用，**必须导出 `apply`**（函数或带 `apply` 方法的对象），否则页面显示
  `Failed to load plugins ... invalid plugin, expect function or object with an "apply" method`。
  本包与官方 bundle 一致：`exports.apply = apply`（注入逻辑在 factory 物化时执行）。
  可用 `node mobile-fit/test/bundle-shape.mjs` 验证。
- 选择器使用官方语义类后缀（`[class$="_sidebarCol"]` 等）与 `data-slot` 槽名，
  官方构建哈希前缀（如 `pI_x6G_`）会随版本变化，语义后缀稳定；**上游 dsh 升级后
  需回归检查并同步适配**。
- 手机端默认隐藏右侧详情列（`_detailsCol`），桌面不受影响。
- **远程访问限制（上游安全设计）**：配置/凭据接口仅限本机回环（localhost）访问，
  远程域名访问 403——模型页、插件配置页、权限、Agent 预设等不可用；通用页语言/
  外观可用。mobile-fit 在设置面板顶部显示双语说明横幅。

---

# mobile-fit (dsh Web Mobile Adaptation Layer)

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
