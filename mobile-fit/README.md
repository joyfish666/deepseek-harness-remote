# mobile-fit（M2：M1 手机 UI 适配层）

> **状态：🚧 开发中（未完成）**。开机自启的部署问题已解决（任务用 vbs 隐藏启动，
> 见仓库 README / `docs/tutorial-m2.md`），但移动端适配功能本身仍在打磨，可能存在
> 布局瑕疵；日常使用请以 M1（原生网站）为准。

让 **M1（官方原生 Web UI）在手机上更好用**：不换界面、不改上游，只通过 dsh 官方
client 插件 seam 注入移动端 CSS 与少量交互（侧栏抽屉、触控目标、底部输入区、安全区适配）。

- 手机与电脑看到的是**同一个官方界面**（同一份前端），窄屏时自动启用移动端布局；
- 电脑浏览器（宽屏）不受任何影响；
- dsh 本体零改动、上游零改动，纯叠加层。

## 工作原理

```
手机浏览器
   │  官方前端 dist（dsh-web-frontend，未改动）
   ▼
window.__ModuleLoader__  ── 加载 /plugins/mobile-fit/client.js（本包注入）
   │  ① <style> 注入：@media (max-width:820px) 移动端规则
   │  ② 交互：汉堡按钮 + 侧栏抽屉 + 遮罩
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
   cmd /c mklink /J "$nm\mobile-fit" "C:\Users\wang\Desktop\vscode\deepseek-harness-remote\mobile-fit"
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

- 手机打开 `https://<机器名>.<tailnet>.ts.net/`（M1 原入口，无需 /m）
- 窄屏时：左上角出现 ☰ 按钮，点击弹出侧栏抽屉；输入区贴底；触控目标放大
- 电脑浏览器无变化

## 自定义

编辑 `lib/client.js` 中的 `css` 字符串与交互逻辑即可；`style` 标签带
`data-plugin-css="mobile-fit/css"`，改完**刷新页面即生效**（无需重启 dsh，bundle rev
由 client-modules 每次请求重新哈希）。

## 已知说明

- **插件形状（重要）**：浏览器端 cordis loader 会把 client bundle 的 exports 当作
  插件应用，**必须导出 `apply`**（函数或带 `apply` 方法的对象），否则页面显示
  `Failed to load plugins ... invalid plugin, expect function or object with an "apply" method`。
  本包与官方 bundle 一致：`exports.apply = apply`（注入逻辑在 factory 物化时执行）。
  可用 `node mobile-fit/test/bundle-shape.mjs` 验证 bundle 形状。
- 选择器使用官方语义类后缀（`[class$="_sidebarCol"]` 等），官方构建哈希前缀（如
  `pI_x6G_`）会随版本变化，语义后缀稳定；若上游改名需要同步更新。
- 手机端默认隐藏右侧详情列（`_detailsCol`），桌面不受影响。
- 与 M3 完全独立：M3 是自建 PWA（`/m/`），M2 是 M1 官方界面的移动端适配（`/`）。
