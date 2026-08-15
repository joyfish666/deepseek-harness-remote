# 方式三（M3）：M1 手机 UI 适配层（mobile-fit）

> **状态：🚧 开发中（首个版本已修复可用）**。不是独立入口——它是**给方式一（M1）
> 的手机端体验做适配**：M1 官方界面在电脑上体验最佳，手机上稍显局促，M3 让它在
> 手机上更好用，而**不换界面、不改上游**。

## 1. 它是什么

M3 = 一个注入式 client 插件（`mobile-fit/`），通过 dsh 官方 client 插件 seam
（与 `dsh-client-ui-*` 同款机制）向官方前端注入移动端 CSS 与少量交互：

```
手机浏览器
   │  官方前端 dist（dsh-web-frontend，未改动）
   ▼
window.__ModuleLoader__ ── 加载 /plugins/mobile-fit/client.js
   │  ① <style> 注入：@media (max-width:820px) 移动端规则
   │  ② 交互：汉堡按钮 + 侧栏抽屉 + 遮罩
   ▼
官方 UI（React 树原样）
```

- **窄屏（≤820px）自动启用**：三栏折叠为单栏、侧栏变抽屉（左上角 ☰ + 遮罩）、
  详情列隐藏、输入区贴底（含 iPhone 安全区）、触控目标 ≥44px、输入框 16px
  （防 iOS 聚焦缩放）；
- **电脑宽屏完全不受影响**（仅媒体查询生效）；
- 手机访问的还是 **M1 原入口** `https://<机器名>.<tailnet>.ts.net/`，无新路径；
- 与 M2 完全独立：M2 是换一套界面（`/m/`），M3 是给官方界面做适配（`/`）。

## 2. 启用

### 前置

- 已完成 **M1**（Tailscale + serve + trustedHosts 均就绪）；
- 本仓库已 clone 到本机（`mobile-fit/` 目录存在）。

### 步骤

1. **把插件包挂进 dsh web profile 的依赖树**（junction 而非复制，改代码即生效）：

   ```powershell
   $nm = "$HOME\.dsh\profiles\web\node_modules"
   New-Item -ItemType Directory -Force $nm | Out-Null
   cmd /c mklink /J "$nm\mobile-fit" "<仓库路径>\mobile-fit"
   ```

2. **在 `~/.dsh/profiles/web/cordis.patch.yml` 末尾追加**：

   ```yaml
   - insert:
       - id: mobile-fit
         name: 'mobile-fit'
   ```

3. **重启 dsh web**（client 插件集合在启动时扫描；热重载不会新增插件行）：

   ```powershell
   schtasks /end /tn dsh-web     # 看门狗 10 秒后自动拉起
   ```

   > 若未注册自启任务（见下节），直接重启 dsh 进程即可。

4. **验证**：手机打开 M1 入口 `https://<机器名>.<tailnet>.ts.net/`，窄屏时左上角
   出现 ☰ 按钮、点击弹出侧栏抽屉、输入区贴底；电脑浏览器无变化。

## 3. 开机自启

**M3 没有自己的自启任务**——它随 dsh 一起启动（挂在 dsh web profile 里）。
只要 **M1 的自启任务（`dsh-web`）在跑，M3 就自动生效**：

```powershell
Get-ScheduledTask -TaskName dsh-web    # 查看
schtasks /run /tn dsh-web              # 立即启动
```

M3 的"停用自启" = 停用 M1 自启（见下节），或仅删除 patch 行并重启 dsh。

## 4. 彻底停用（恢复原始状态）

```powershell
# 1. 删除 patch 里的 mobile-fit 行（热重载对删除行生效，
#    但 client 插件集合变化需重启 dsh 才完全卸载）：
#    编辑 ~/.dsh/profiles/web/cordis.patch.yml，删除：
#      - insert:
#          - id: mobile-fit
#            name: 'mobile-fit'
#    以及顶部对应注释。

# 2. 删除 junction（解除挂载）
Remove-Item "$HOME\.dsh\profiles\web\node_modules\mobile-fit"

# 3. 重启 dsh 使插件集合变化生效
schtasks /end /tn dsh-web    # 看门狗自动拉起

# 4. 可选：彻底删除仓库里的 mobile-fit/ 目录（不影响 M1/M2）
```

验证停用：手机打开 M1 入口，不再出现 ☰ 按钮；桌面端无变化。

## 5. 自定义

编辑 `mobile-fit/lib/client.js`：

- `css` 字符串：移动端规则（选择器用官方语义类后缀 `[class$="_sidebarCol"]`
  等，构建哈希前缀随版本变化但语义后缀稳定）；
- 交互逻辑：汉堡按钮/抽屉/遮罩。

改完**刷新页面即生效**（bundle rev 由 client-modules 每次请求重新哈希）；
新增插件行才需要重启 dsh。

## 6. 已知说明

- **与 M1 的冲突**：无。M3 只是给 M1 界面叠加移动端样式，宽屏行为不变；
- **与 M2 的冲突**：无。入口不同（`/` vs `/m/`），patch 行互不干扰；
- 手机端默认隐藏右侧详情列（`_detailsCol`），桌面不受影响；
- 若 dsh 升级导致 UI 类名后缀变化，需要同步更新 `client.js` 中的选择器。
