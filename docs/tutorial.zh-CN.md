# dsh Web 远程访问与移动端适配——从零开始（网页端 + APK）

> 🌐 **语言**：[English](tutorial.md) · 中文

> **读者**：所有用户。读完本文即可从 0 到"电脑 + 手机都能用"，包括网页端与 APK
> 两种使用方式、手动启动与开机自启的选择、Token 开关、以及彻底卸载。
> 开发者请另读 [pitfalls.zh-CN.md](pitfalls.zh-CN.md) 与 [development.zh-CN.md](development.zh-CN.md)。

---

## 0. 前置条件

| 需要 | 说明 |
|---|---|
| 电脑 | Windows / macOS / Linux，已安装 Node.js（≥22） |
| dsh | `npx @deepseek-ai/dsh web` 可正常启动（默认 `127.0.0.1:3080`） |
| 手机 | 安卓（APK 或浏览器）或 iOS（仅浏览器） |
| Tailscale 账号（可选） | 免费版即可，电脑与手机登录**同一账号**（仅远程访问需要） |

> 只想本机用：只需电脑 + Node.js，跳过第 2.3 节即可。

---

## 1. 先做三个选择

| 选择 | 选项 | 说明 |
|---|---|---|
| 启动方式 | A. 手动启动 / B. 开机自启 | 见第 2.1 节与第 5 节；不选 B 则每次手动启动 |
| 使用端 | 网页端 / APK | 网页端见第 2 节；APK 见第 3 节；两者共用同一入口 |
| Token | 开 / 关 | 仅部署了 remote-config 反代时需要，见第 4.3 节 |

---

## 2. 网页端教程（从 0）

### 2.1 启动 dsh Web

**方式 A：命令行启动**（最简单）

```sh
npx @deepseek-ai/dsh web
```

浏览器打开 `http://127.0.0.1:3080`，看到官方界面即成功。窗口关闭 = 停止服务。

**方式 B：用仓库脚本启动**（Windows）

双击 `scripts/start-dsh.ps1`（或在终端运行）。脚本特性：

- 以 node 直接运行（无 cmd.exe 包装窗口）；
- 进程崩溃 **10 秒后自动重启**（看门狗）；
- 端口被占用则退出（避免双实例）；
- 日志：`~/.dsh/logs/dsh-web.log`。

### 2.2 本机验证

浏览器打开 `http://127.0.0.1:3080`，看到 DeepSeek Harness 界面即成功。

### 2.3 手机远程访问（Tailscale）

目标：手机浏览器打开 `https://<机器名>.<tailnet>.ts.net/` 就能访问电脑上的 dsh。

1. **组网**：电脑安装 Tailscale 并登录；手机装 App 并登录**同一账号**；
   验证：`tailscale status` 能看到两台设备（`100.x.y.z` 形式 IP）。

2. **启用 Serve**（一次性管理员授权）：

   ```sh
   tailscale serve --bg 3080
   ```

   首次会打印 `https://login.tailscale.com/f/serve?node=xxxx`，用浏览器打开并点
   **Enable**，然后重新执行上面的命令，看到 `Serve started and running in the
   background` 即成功。

3. **配置信任围栏**：dsh 的 `/api` 只放行 loopback 或 `trustedHosts` 中的 Host。
   编辑 `~/.dsh/profiles/web/cordis.patch.yml`（Windows：`%USERPROFILE%\.dsh\...`），
   不存在则新建：

   ```yaml
   - id: connection
     config:
       trustedHosts: !!js "['<你的机器名>.<你的tailnet>.ts.net', ...ctx.webRuntime.trustedHosts]"
   ```

   - `<你的机器名>.<你的tailnet>.ts.net` 用 `tailscale serve status` 输出里的域名；
   - ⚠️ `!!js` 只接受单个 YAML 标量，**整个表达式必须用双引号包裹**；
   - 该文件由 dsh 热重载，**无需重启 dsh**，几秒内生效。

4. **验证**：手机浏览器（保持 Tailscale App 连接）打开
   `https://<你的机器名>.<tailnet>.ts.net/`。**用域名不要用 IP**（Serve 只为域名签发证书）。

### 2.4 手机适配（mobile-fit，可选但推荐）

手机窄屏时自动获得移动端布局（抽屉导航、会话操作、输入体验、设置面板全屏化等）。

1. **挂载插件**（junction，改代码即生效）：

   ```powershell
   $nm = "$HOME\.dsh\profiles\web\node_modules"
   New-Item -ItemType Directory -Force $nm | Out-Null
   cmd /c mklink /J "$nm\mobile-fit" "<仓库路径>\mobile-fit"
   ```

2. **追加 patch 行**：在 `~/.dsh/profiles/web/cordis.patch.yml` 末尾追加：

   ```yaml
   - insert:
       - id: mobile-fit
         name: 'mobile-fit'
   ```

3. **重启 dsh web**（client 插件集合在启动时扫描；热重载不会新增插件行）：

   ```powershell
   schtasks /end /tn dsh-web    # 若注册了自启任务，看门狗 10 秒后自动拉起
   ```

   未注册自启任务的话，直接重启 dsh 进程即可。

4. **验证**：手机打开入口 → 左上角出现 ☰，点击弹出侧栏抽屉；输入框回车换行、
   右下角箭头发送；**切换会话不自动弹键盘**（点输入框才聚焦）。电脑宽屏无任何变化。

### 2.5 网页端验证清单

| 领域 | 期望行为 |
|---|---|
| 侧栏 | ☰ 打开抽屉 → 直接显示会话列表（无图标栏），× / 遮罩关闭 |
| 会话行 | 行高 44px；⋯ 菜单可用（重命名/分叉/归档） |
| 标题/统计栏 | 顶部会话名与底部统计栏可左右滑动查看完整内容 |
| 输入 | 回车换行（不发送），右下角箭头发送；输入区贴底；切换会话不自动弹键盘 |
| 设置 | 面板全屏显示，顶部横向标签切换分区，内容可滚动 |
| 内测声明 | 首次点"继续"后不再弹出 |

---

## 3. APK 教程

APK 是 dsh Web 界面的**安卓原生壳**（WebView 容器）：独立图标、免浏览器、地址与
Token 一屏配置。手机：安卓 8.0+（API 26+）。

### 3.1 安装

- 用电脑构建或直接拷贝安装包到手机（`adb install -r` 或点击 APK 文件安装）；
- 首次安装需允许"安装未知来源应用"。

### 3.2 首次使用

1. 打开 App → 在同一个界面填写两样东西：
   - **访问地址**：电脑端 dsh 的 Tailscale 地址
     （`https://<机器名>.<tailnet>.ts.net/`，可省略 `https://`）；
   - **Token**（可选）：部署了 remote-config 反代且开启 Token 时填写
     （见第 4.3 节）。填了 Token 后 WebView 自动带上，**不会再出现反代的登录页**；
2. 点"连接" → 若手机 Tailscale 未连接，顶部出现黄色横幅，点"打开"跳到
   Tailscale App；连接后横幅自动消失；
3. 界面与手机浏览器完全一致（mobile-fit 全部生效）。

### 3.3 日常使用

| 操作 | 方法 |
|---|---|
| 打开会话 | 左上角 ☰ 抽屉，点击会话（不会弹出键盘；点输入框才聚焦） |
| 发送消息 | 右下角箭头（回车是换行） |
| 设置（改地址/改 Token/清数据/常亮） | 左上角 ☰ 下方的 ⚙ 齿轮（仅 APK 内有） |
| 上传文件 | 与网页一致（走系统文件选择器） |
| 下载文件 | 自动存入系统"下载"目录（有通知） |
| 外链 | 自动用系统浏览器打开（壳内只停留 dsh 域名） |
| 返回 | 系统返回键 = 网页后退；无历史时退出 App |

### 3.4 验证清单

网页端清单见第 2.5 节（APK 内页面同一入口），另加壳层项：

| 壳层项 | 期望行为 |
|---|---|
| ⚙ 齿轮 | 位于 ☰ 下方；点击弹出原生设置面板 |
| 保持屏幕常亮 | 设置里打开后，充电/不操作时屏幕不熄灭 |

---

## 4. 远程配置解锁（可选反代）

**用途**：默认情况下配置/凭据类页面（模型、插件、权限、Agent 预设、API Key）
仅限电脑本机访问（远程 403，属 dsh 上游安全设计）。部署一个小型反代后，
**手机浏览器与 APK 都能改配置**。

**原理一句话**：dsh 的信任围栏只看 Host 头字符串——反代把 Host 改写成回环拼写
并删除 Origin，配置平面即对远程放行。详见 development.zh-CN.md。

### 4.1 部署反代（手动）

```powershell
cd <仓库>\scripts
node remote-config-proxy.mjs
```

默认：监听 `127.0.0.1:3081`，转发到 `http://127.0.0.1:3080`。反代**只绑定
loopback**——局域网内其他设备无法直连。

### 4.2 把 serve 指向反代

```powershell
tailscale serve status                          # 先记录当前挂载
tailscale serve --bg 3081                       # 根 / -> 127.0.0.1:3081
tailscale serve status                          # 检查；若 /m 丢失则补回：
tailscale serve --bg --set-path /m http://127.0.0.1:3100
```

### 4.3 Token 开关

围栏不是认证层：**能触达反代的人就能改配置**。tailnet 设备身份是主要边界；
Token 是第二道防线（**可选**，建议开启）。

**开启**（电脑上，一次性）：

```powershell
setx DSH_PROXY_TOKEN <你的密码>     # 持久化，新进程生效
```

然后**重启反代**（关掉再重新运行 `node remote-config-proxy.mjs`）。

**使用固定密码**（如 `wang2004`）可以避免自启/换机后重新登录（cookie 有效期 1 年，
基本只登录一次）；代价是强度低于随机长串。

**在哪里填密码**：

- **手机浏览器**：打开页面会先看到登录页 → 输入密码 → 解锁（每台手机一次）；
- **APK**：在首次使用界面或 ⚙ 设置里直接填 Token → 保存（WebView 不会再出现登录页）。

**更换/关闭**：`setx DSH_PROXY_TOKEN <新密码>` 并重启反代即可让所有手机失效；
不设置该变量 = 关闭 Token（仅 tailnet 身份认证）。

### 4.4 加载提速说明

反代会给带 `?rev=` 的 bundle 响应加一年期 immutable 缓存头——dsh 上游的 bundle
是无缓存策略且无校验头，慢链路上每次加载都会全量重下（数秒）。rev 是内容哈希，
缓存语义安全。**注意：浏览器请用正常模式**，无痕模式每次冷启动无法缓存。

---

## 5. 开机自启（可选）

> **不是必须的**。不想要就跳过——每次手动启动完全够用。
> 若启用，登录电脑后 dsh 与反代自动在后台运行，无需任何窗口。

### 5.1 dsh web

```powershell
$action = New-ScheduledTaskAction -Execute 'wscript.exe' `
  -Argument '"<仓库路径>\scripts\start-dsh.vbs"'
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName 'dsh-web' -Action $action -Trigger $trigger -Settings $settings -Force
```

> 为什么用 wscript + vbs：计划任务直接执行 powershell 时隐藏标志不生效，
> 会弹空白窗口（见 pitfalls P25/P26）。

### 5.2 remote-config 反代（若部署了）

```powershell
$action = New-ScheduledTaskAction -Execute 'wscript.exe' `
  -Argument '"<仓库>\scripts\start-remote-config-proxy.vbs"'
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName 'dsh-remote-config-proxy' -Action $action -Trigger $trigger -Settings $settings -Force
```

`start-remote-config-proxy.ps1` 是看门狗（10 秒重启、端口冲突保护、日志在
`~/.dsh/logs/remote-config-proxy.log`）。

### 5.3 管理命令

| 操作 | 命令 |
|---|---|
| 查看任务 | `Get-ScheduledTask -TaskName dsh-web` |
| 立即启动 | `schtasks /run /tn dsh-web` |
| 重启 | `schtasks /end /tn dsh-web`（看门狗 10 秒后自动拉起） |
| 停用自启 | `Unregister-ScheduledTask -TaskName dsh-web` |

> Tailscale 是系统服务、serve 配置持久保存，重启电脑自动恢复，无需处理。

---

## 6. 彻底卸载（还原到部署前，无残留）

以下步骤按需执行，全部执行后项目痕迹清零：

```powershell
# 1.（若启用过自启）注销计划任务
Unregister-ScheduledTask -TaskName dsh-web
Unregister-ScheduledTask -TaskName dsh-remote-config-proxy

# 2. 关闭 serve 转发（手机立即无法访问）
tailscale serve --https=443 off
tailscale serve status        # 应显示 No serve config

# 3. 恢复 dsh 配置：把 cordis.patch.yml 恢复为初始内容（热重载生效，无需重启）
#    删除 trustedHosts 段与 mobile-fit insert 段，恢复为：
#    -------
#    # Your patch layer for this dsh profile, applied after every bundle layer:
#    []
#    -------

# 4. 删除 mobile-fit junction（解除挂载）
Remove-Item "$HOME\.dsh\profiles\web\node_modules\mobile-fit"

# 5. 停止 dsh web 与反代（若在运行）：关闭其窗口，或 schtasks /end /tn ...
```

**APK**：设置 → 应用管理 → DSH Remote → 卸载（或 `adb uninstall dev.dsh.remote`）。

**验证还原**：手机打不开原地址；电脑本地 `http://127.0.0.1:3080` 正常（dsh 本身
不受影响）；`curl -H "Host: <任意tailnet地址>" http://127.0.0.1:3080/api/session.list`
返回 `403`（围栏恢复）。

> 仓库本身可保留（不影响任何东西）；不需要时删除本仓库目录即可，无后台残留。

---

## 7. 常见问题

| 现象 | 处理 |
|---|---|
| 手机打不开域名 | 检查手机 Tailscale App 已连接（VPN 图标）；确认与电脑同一账号 |
| 想用 IP 访问 | 不支持，请用域名 |
| 重启电脑后手机连不上 | 确认 Tailscale 随系统启动、`tailscale serve status` 显示运行中 |
| 页面能开但某些功能报 403 | 配置/凭据类页面远程访问默认 403（上游安全设计）；部署反代后可解锁（第 4 节）。若基础功能也 403，则是 `trustedHosts` 未生效（见第 2.3 节） |
| 内测声明每次刷新都弹出 | 点一次"继续"后不再弹出（mobile-fit 已本地持久化） |
| 页面显示 "Failed to load plugins" | mobile-fit 未生效：确认 junction 与 patch 行正确后重启 dsh（见第 2.4 节） |
| 手机浏览器加载慢（无痕模式） | 无痕模式每次冷启动全量重下资源；请用**正常模式**（见第 4.4 节） |
| 命令行找不到 `tailscale` | Windows 用完整路径：`C:\Program Files\Tailscale\tailscale.exe` |
| 开机看到一个 cmd.exe 窗口 | 是 AMD 显卡驱动（`AMDRSServ.exe`），与项目无关，可关闭 |
| APK 打开后出现反代登录页 | 在 APK ⚙ 设置里填 Token 保存（见第 4.3 节） |
| APK 顶部内容被摄像头挖孔遮挡 | 已内置适配（内容从状态栏下方开始）；老版本请升级 |
