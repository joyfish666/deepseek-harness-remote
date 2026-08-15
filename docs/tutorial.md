# dsh Web 远程访问与移动端适配（mobile-fit）

> **状态：✅ 已可用**——电脑网页端直接访问 dsh Web 界面；手机网页端经 mobile-fit
> 注入式适配（抽屉导航、会话操作、输入体验、设置面板全屏化等），持续打磨中。
> 后续计划：**APK（安卓原生壳）**。
>
> **零上游改动**：本项目**无需修改源 dsh 代码**（官方前端 dist 原样、dsh 本体原样），
> 只通过官方 client 插件 seam 注入移动端样式与少量交互。**若上游 dsh 源码更新，
> 本项目会同步适配**（类名后缀 / 槽名 / 接口变化时更新 `mobile-fit/lib/client.js`）。

## 1. 项目结构

```
电脑/手机浏览器
   │  HTTPS（Tailscale 设备身份认证 + WireGuard 加密）
   ▼
tailscale serve（电脑 443 端口，反向代理）
   ▼
dsh web（127.0.0.1:3080，只监听本机）
   │  /api 信任围栏（trustedHosts 白名单）
   ├─ 电脑宽屏：官方界面原样
   └─ 手机窄屏（≤820px）：官方界面 + mobile-fit 注入适配
        │  window.__ModuleLoader__ ── 加载 /plugins/mobile-fit/client.js
        │  ① <style> 注入：@media (max-width:820px) 移动端规则
        │  ② 交互：汉堡按钮 + 侧栏抽屉 + 遮罩 + 启动调整
        ▼
     官方 UI（React 树原样）
```

- 电脑与手机看到的是**同一个 URL、同一份官方前端**，窄屏自动启用移动端布局，
  电脑宽屏完全不受影响；
- 手机入口与电脑一致：`https://<机器名>.<tailnet>.ts.net/`（本机可用
  `http://127.0.0.1:3080`）。

## 2. 部署 dsh Web（电脑网页端访问）

### 准备

| 端 | 要求 |
|---|---|
| 电脑 | Node.js，`npx @deepseek-ai/dsh web` 可正常启动（默认 `127.0.0.1:3080`） |
| 手机（可选，仅需本机访问可跳过） | 安卓 / iOS，安装 [Tailscale](https://tailscale.com/download) App |
| 账号（可选） | 一个 Tailscale 账号（免费版即可），电脑与手机登录同一账号 |

### 第 1 步：组网（仅远程访问需要）

1. 电脑安装 Tailscale 并登录；手机装 App 并登录**同一账号**。
2. 验证：`tailscale status` 能看到两台设备（`100.x.y.z` 形式 IP）。

### 第 2 步：启用 Serve（一次性管理员授权）

```sh
tailscale serve --bg 3080
```

首次会打印 `https://login.tailscale.com/f/serve?node=xxxx`，用浏览器打开并点
**Enable**，然后重新执行上面的命令，看到 `Serve started and running in the
background` 即成功。

### 第 3 步：配置 dsh 信任围栏

dsh 的 `/api` 只放行 loopback 或 `trustedHosts` 中的 Host。编辑
`~/.dsh/profiles/web/cordis.patch.yml`（Windows：`%USERPROFILE%\.dsh\...`），
不存在则新建：

```yaml
- id: connection
  config:
    trustedHosts: !!js "['<你的机器名>.<你的tailnet>.ts.net', ...ctx.webRuntime.trustedHosts]"
```

- `<你的机器名>.<你的tailnet>.ts.net` 用 `tailscale serve status` 输出里的域名；
- ⚠️ 格式坑：`!!js` 只接受单个 YAML 标量，**整个表达式必须用双引号包裹**；
- 该文件由 dsh 热重载，**无需重启 dsh**，几秒内生效。

### 第 4 步：验证与访问

手机浏览器（保持 Tailscale App 连接）打开 `https://<你的机器名>.<tailnet>.ts.net/`；
电脑浏览器打开 `http://127.0.0.1:3080`。

> ⚠️ 用**域名**不要用 IP：Tailscale Serve 只为域名签发 TLS 证书。

### 第 5 步：开机自启（可选）

Tailscale 是系统服务、serve 配置持久保存，重启电脑自动恢复；**dsh 本体不会自启**，
注册计划任务：

```powershell
# 用 wscript 隐藏启动（vbs 包装），登录时无任何 cmd/powershell 窗口
$action = New-ScheduledTaskAction -Execute 'wscript.exe' `
  -Argument '"<仓库路径>\scripts\start-dsh.vbs"'
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName 'dsh-web' -Action $action -Trigger $trigger -Settings $settings -Force
```

> 💡 **为什么用 wscript + vbs**：计划任务直接执行 `powershell.exe -WindowStyle Hidden`
> 时，隐藏标志在登录场景下**不生效**，会弹出两个"空的 powershell 窗口"（见
> `docs/pitfalls.md`）。`start-dsh.vbs` 用 `WshShell.Run(..., 0, False)`（SW_HIDE）
> 启动，**登录时零窗口**。

脚本行为：登录时启动 dsh web（直接以 node 运行，无 cmd.exe 包装）；进程崩溃
10 秒后自动重启；端口被占用则退出避免双实例。日志：`~/.dsh/logs/dsh-web.log`。

管理命令：

| 操作 | 命令 |
|---|---|
| 查看任务 | `Get-ScheduledTask -TaskName dsh-web` |
| 立即启动 | `schtasks /run /tn dsh-web` |
| 重启（先结束再拉起） | `schtasks /end /tn dsh-web`（看门狗 10 秒后自动重启） |
| 停用自启 | `Unregister-ScheduledTask -TaskName dsh-web` |

## 3. 启用手机适配（mobile-fit）

### 前置

- 第 2 节部署完成（dsh web 可访问）；
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

   > 若未注册自启任务，直接重启 dsh 进程即可。

4. **验证**：手机打开入口，窄屏时左上角出现 ☰ 按钮，点击弹出侧栏抽屉（直接
   显示会话列表，右上角 × 关闭）；输入框回车换行、右下角箭头发送；电脑浏览器
   无变化。详细行为见第 5 节清单。

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

# 4.（可选）恢复信任围栏 / 关闭 serve / 停用 dsh 自启：
#    把 cordis.patch.yml 恢复为初始内容（热重载生效）
#    tailscale serve --https=443 off
#    Unregister-ScheduledTask -TaskName dsh-web

# 5. 可选：彻底删除仓库里的 mobile-fit/ 目录
```

验证停用：手机打开入口，不再出现 ☰ 按钮；桌面端无变化。

## 5. 移动端行为清单

以下为手机（≤820px）上的完整行为，改代码后逐项回归：

| 领域 | 行为 |
|---|---|
| 侧栏导航 | 左上角 ☰ 打开抽屉；打开后**直接显示展开的侧边栏内容**（会话列表、搜索、设置入口），不再出现图标收纳栏；☰ 移入品牌行右侧变为 × 关闭；点遮罩也可关闭 |
| 侧栏状态 | 页面加载时即预展开侧栏（每次加载最多触发一次，避免与打开抽屉的展开动作竞态）；会话行/项目行高 44px（触控标准），⋯ 菜单常驻可见（重命名/分叉/归档/工作区操作），相对时间常驻显示 |
| 会话标题/统计栏 | 底部统计栏（轮数/步数/耗时/速率等）与顶部会话标题（面包屑）可**左右滑动查看**完整内容（隐藏滚动条） |
| 输入体验 | 输入框 **Enter 换行**（发送用右下角箭头）；输入框 16px 防 iOS 聚焦缩放；iOS 键盘回车键提示为"换行"（enterkeyhint）；输入区贴底并适配 iPhone 安全区 |
| 设置面板 | 全屏显示（100vw × 100dvh、无圆角、适配安全区）；导航栏变为**顶部横向标签条**；各分区内容可正常滚动 |
| 内测声明 | 首次弹出，点"继续"后**不再弹出**（localStorage 持久化；上游在远程浏览器下仅内存保存，这是 mobile-fit 的补充） |
| 上游安全提示 | 远程访问时，设置面板顶部显示说明横幅：配置/凭据接口（模型、插件配置、权限、Agent 预设等）仅限本机回环访问，远程 403 属 dsh 上游安全设计；横幅**跟随界面语言**中英切换，通用页内语言/外观等可用功能不受影响 |
| 触控细节 | 触控目标 ≥44px；会话/项目行、图标按钮均满足；详情列（右侧）默认隐藏；对话拖拽手柄隐藏 |
| 兼容性 | 电脑宽屏（>820px）完全无变化；820–1024px 为官方窄屏态（收纳栏），mobile-fit 不介入 |

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

- **零上游改动**：官方前端 dist 与 dsh 本体均未修改；`deepseek-harness-master/`
  仅为本地参考源码（不纳入版本控制、不上传）。**上游 dsh 源码更新后，本项目会
  同步适配**：类名后缀、`data-slot` 槽名或接口变化时更新 `mobile-fit/lib/client.js`
  并回归行为清单；
- **远程访问限制（上游安全设计，非本项目缺陷）**：dsh 把配置/凭据接口
  （`settings.describe`/`credentials.*` 等）钉在本机回环，远程域名访问一律 403——
  模型页报错、插件配置页/权限/Agent 预设相关操作空白或不可用均属此列；通用页的
  语言/外观等不依赖该平面的功能正常。电脑上用 `http://127.0.0.1:<端口>` 访问即可；
- 手机端默认隐藏右侧详情列（`_detailsCol`），桌面不受影响；
- 内测声明的本地持久化键绑定上游声明版本号（`mobile-fit:welcome-ack:<版本>`），
  上游声明文案变更后需同步更新该键以重新提示一次；
- **后续计划：APK（安卓原生壳）**——把当前网页端适配体验打包为安卓应用
  （WebView 壳 + 通知等），届时沿用本仓库的适配层与部署链路。
