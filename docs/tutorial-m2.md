# 方式二（M2）：M1 手机 UI 适配层（mobile-fit）

> **状态：✅ 基本可用（移动端日常使用，持续打磨中）**。M2 不是独立入口——它是
> **给方式一（M1）的手机端体验做适配**：M1 官方界面在电脑上体验最佳、手机上稍显
> 局促，M2 让它在手机上更好用，而**不换界面、不改上游**（官方前端 dist 零改动、
> dsh 本体零改动，纯叠加层）。桌面（宽屏）完全不受影响。

## 1. 它是什么

M2 = 一个注入式 client 插件（`mobile-fit/`），通过 dsh 官方 client 插件 seam
（与 `dsh-client-ui-*` 同款机制）向官方前端注入移动端 CSS 与少量交互：

```
手机浏览器
   │  官方前端 dist（dsh-web-frontend，未改动）
   ▼
window.__ModuleLoader__ ── 加载 /plugins/mobile-fit/client.js
   │  ① <style> 注入：@media (max-width:820px) 移动端规则
   │  ② 交互：汉堡按钮 + 侧栏抽屉 + 遮罩 + 启动调整
   ▼
官方 UI（React 树原样）
```

- **窄屏（≤820px）自动启用**，手机与电脑看到的是同一个 URL、同一份官方界面；
- 电脑宽屏完全不受影响（所有规则都在媒体查询内，交互逻辑也按 `matchMedia` 门控）；
- 手机访问的还是 **M1 原入口** `https://<机器名>.<tailnet>.ts.net/`，无新路径；
- 与 M3 完全独立：M3 是换一套界面（`/m/`），M2 是给官方界面做适配（`/`）。

> 💡 **M1 与 M2 是否必须复用同一个路径？** 是——这是刻意设计，不是限制：
>
> - M2 的本质是**给 M1 官方前端注入样式/交互的叠加层**，没有自己的页面或服务器；
> - 启用/停用由**屏幕宽度**决定（`@media (max-width: 820px)`）：手机窄屏自动得到
>   移动端适配，电脑宽屏不受影响——同一个 URL，两端各取所需；
> - 若你希望"手机访问一个独立地址"（真正的独立界面），那是 **M3**（`/m/` 自建
>   PWA）的定位。M2 刻意不新增路径。

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
   出现 ☰ 按钮，点击弹出侧栏抽屉（直接显示会话列表，右上角 × 关闭）；输入框
   回车换行、右下角箭头发送；电脑浏览器无变化。详细行为见第 5 节清单。

## 3. 开机自启

**M2 没有自己的自启任务**——它随 dsh 一起启动（挂在 dsh web profile 里）。
只要 **M1 的自启任务（`dsh-web`）在跑，M2 就自动生效**：

```powershell
Get-ScheduledTask -TaskName dsh-web    # 查看
schtasks /run /tn dsh-web              # 立即启动
```

> M1 的自启任务必须是 **vbs 隐藏方式**（`wscript.exe + start-dsh.vbs`，见
> [tutorial-m1.md](tutorial-m1.md) 第 3 节）——旧式 `powershell.exe -WindowStyle
> Hidden` 会在登录时弹出空白窗口（见 `docs/pitfalls.md` P32/P33）。

M2 的"停用自启" = 停用 M1 自启（见下节），或仅删除 patch 行并重启 dsh。

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

# 4. 可选：彻底删除仓库里的 mobile-fit/ 目录（不影响 M1/M3）
```

验证停用：手机打开 M1 入口，不再出现 ☰ 按钮；桌面端无变化。

## 5. 移动端行为清单

以下为 M2 在手机（≤820px）上的完整行为，改代码后逐项回归：

| 领域 | 行为 |
|---|---|
| 侧栏导航 | 左上角 ☰ 打开抽屉；打开后**直接显示展开的侧边栏内容**（会话列表、搜索、设置入口），不再出现图标收纳栏；☰ 移入品牌行右侧变为 × 关闭；点遮罩也可关闭 |
| 侧栏状态 | 页面加载时即预展开侧栏（每次加载最多触发一次，避免与打开抽屉的展开动作竞态）；会话行/项目行高 44px（触控标准），⋯ 菜单常驻可见（重命名/分叉/归档/工作区操作），相对时间常驻显示 |
| 会话标题/统计栏 | 底部统计栏（轮数/步数/耗时/速率等）与顶部会话标题（面包屑）可**左右滑动查看**完整内容（隐藏滚动条） |
| 输入体验 | 输入框 **Enter 换行**（发送用右下角箭头）；输入框 16px 防 iOS 聚焦缩放；iOS 键盘回车键提示为"换行"（enterkeyhint）；输入区贴底并适配 iPhone 安全区 |
| 设置面板 | 全屏显示（100vw × 100dvh、无圆角、适配安全区）；导航栏变为**顶部横向标签条**；各分区内容可正常滚动 |
| 内测声明 | 首次弹出，点"继续"后**不再弹出**（localStorage 持久化；上游在远程浏览器下仅内存保存，这是 M2 的补充） |
| 上游安全提示 | 远程访问时，设置面板顶部显示说明横幅：配置/凭据接口（模型、插件配置、权限、Agent 预设等）仅限本机回环访问，远程 403 属 dsh 上游安全设计；横幅**跟随界面语言**中英切换，通用页内语言/外观等可用功能不受影响 |
| 触控细节 | 触控目标 ≥44px；会话/项目行、图标按钮均满足；详情列（右侧）默认隐藏；对话拖拽手柄隐藏 |
| 兼容性 | 电脑宽屏（>820px）完全无变化；820–1024px 为官方窄屏态（收纳栏），M2 不介入 |

## 6. 自定义

编辑 `mobile-fit/lib/client.js`，分四块：

- **CSS 字符串**（`css` 数组，`@media (max-width: 820px)` 内）：
  移动端规则。选择器尽量用官方语义类后缀（`[class$="_sidebarCol"]`），构建哈希
  前缀随版本变化但语义后缀稳定；**多类名元素用子串匹配 `[class*="_xxx"]`**
  （后缀匹配会在行获得 `selected`/`menuOpen` 等尾类时失效，见 `docs/pitfalls.md`）；
- **抽屉交互**：汉堡按钮创建/悬浮层、`openDrawer`/`closeDrawer`（☰ 与 × 互转、
  遮罩、侧栏展开兜底）；
- **启动调整**：`expandSidebarForMobile`（加载时预展开，幂等）、
  `dismissWelcomeIfAcknowledged`（内测声明本地持久化 + 静默关闭）、
  `composerEnterToNewline`（Enter 换行，仅 stopPropagation 保留浏览器原生行为）、
  `syncSettingsBanner`（上游安全提示横幅，中英双语）；
- **观察器**：body 级 MutationObserver（childList）维持按钮层；子树观察器（防抖）
  同步横幅；点击捕获监听记录声明确认。

改完**刷新页面即生效**（bundle rev 由 client-modules 每次请求重新哈希）；
新增插件行才需要重启 dsh。修改后运行 `node mobile-fit/test/bundle-shape.mjs`
验证插件形状。

## 7. 已知说明

- **与 M1 的冲突**：无。M2 只是给 M1 界面叠加移动端样式，宽屏行为不变；
- **与 M3 的冲突**：无。入口不同（`/` vs `/m/`），patch 行互不干扰；
- **远程访问限制（上游安全设计，非 M2 缺陷）**：dsh 把配置/凭据接口
  （`settings.describe`/`credentials.*` 等）钉在本机回环，远程域名访问一律 403——
  模型页报错、插件配置页/权限/Agent 预设相关操作空白或不可用均属此列；通用页的
  语言/外观等不依赖该平面的功能正常。电脑上用 `http://127.0.0.1:<端口>` 访问即可；
- 手机端默认隐藏右侧详情列（`_detailsCol`），桌面不受影响；
- 若 dsh 升级导致 UI 类名后缀或 `data-slot` 槽名变化，需要同步更新 `client.js`
  中的选择器；
- 内测声明的本地持久化键绑定上游声明版本号（`mobile-fit:welcome-ack:<版本>`），
  上游声明文案变更后需同步更新该键以重新提示一次。
