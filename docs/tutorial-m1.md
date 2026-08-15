# 方式一（M1）：Tailscale 隧道 + 官方 Web UI（原生网站）

> **状态：✅ 完全可用（正式入口）**。零自建代码，dsh 官方原生网站在手机上原样使用。
>
> 这是三种方式中**唯一已完成**的方式，也是日常使用的默认方案。

## 1. 它是什么

M1 = **dsh 官方 Web UI（原生网站）**，通过 Tailscale 隧道安全送到手机。

```
手机浏览器
   │  HTTPS（Tailscale 设备身份认证 + WireGuard 加密）
   ▼
tailscale serve（电脑 443 端口）
   │  反向代理
   ▼
dsh web（127.0.0.1:3080，只监听本机）
   │  /api 信任围栏（trustedHosts 白名单）
   ▼
DeepSeek Harness 本体
```

- 手机看到的界面与电脑**完全一样**（同一份前端、同一个端口）；
- **不修改 dsh 任何代码**，唯一的配置改动是把 tailnet 域名加进 `trustedHosts`；
- 入口：`https://<机器名>.<tailnet>.ts.net/`（**根路径**）。

## 2. 启用（从零开始，约 10 分钟）

### 准备

| 端 | 要求 |
|---|---|
| 电脑 | Node.js，`npx @deepseek-ai/dsh web` 可正常启动（默认 `127.0.0.1:3080`） |
| 手机 | 安卓 / iOS，安装 [Tailscale](https://tailscale.com/download) App |
| 账号 | 一个 Tailscale 账号（免费版即可），电脑与手机登录同一账号 |

### 第 1 步：组网

1. 电脑安装 Tailscale 并登录；手机装 App 并登录**同一账号**。
2. 验证：`tailscale status` 能看到两台设备（`100.x.y.z` 形式 IP）。

### 第 2 步：启用 Serve（一次性管理员授权）

```sh
tailscale serve --bg 3080
```

首次会打印 `https://login.tailscale.com/f/serve?node=xxxx`，用浏览器打开并点 **Enable**，然后重新执行上面的命令，看到 `Serve started and running in the background` 即成功。

### 第 3 步：配置 dsh 信任围栏

dsh 的 `/api` 只放行 loopback 或 `trustedHosts` 中的 Host。编辑
`~/.dsh/profiles/web/cordis.patch.yml`（Windows：`%USERPROFILE%\.dsh\...`），不存在则新建：

```yaml
- id: connection
  config:
    trustedHosts: !!js "['<你的机器名>.<你的tailnet>.ts.net', ...ctx.webRuntime.trustedHosts]"
```

- `<你的机器名>.<你的tailnet>.ts.net` 用 `tailscale serve status` 输出里的域名；
- ⚠️ 格式坑：`!!js` 只接受单个 YAML 标量，**整个表达式必须用双引号包裹**；
- 该文件由 dsh 热重载，**无需重启 dsh**，几秒内生效。

### 第 4 步：验证与访问

```sh
tailscale serve --bg 3080
```

手机浏览器（保持 Tailscale App 连接）打开：

```
https://<你的机器名>.<tailnet>.ts.net/
```

> ⚠️ 用**域名**不要用 IP：Tailscale Serve 只为域名签发 TLS 证书。
> 可选验证：`curl -s -o NUL -w "%{http_code}" -H "Host: <你的域名>" http://127.0.0.1:3080/api/session.list` 返回 `404` 即围栏放行（404 是路径不合法，正常）；陌生 Host 应返回 `403`。

> ⚠️ **关于开机出现的 cmd.exe 窗口**：旧版自启脚本通过 `npx`（.cmd 批处理）启动
> dsh，会留下一个 `cmd.exe /d /s /c dsh web` 窗口——**不要关闭它**（关闭会终止
> dsh web，M1 断连）。2026-08-15 起新版脚本改为直接 `node` 运行，**重启电脑后该
> 窗口不再出现**。若看到另一个 `cmd.exe /C AMDRSServ.exe`，那是 AMD 显卡驱动，
> 与项目无关，可关闭。

## 3. 开机自启

Tailscale 是系统服务、serve 配置持久保存，重启电脑自动恢复；**dsh 本体不会自启**，需注册计划任务：

```powershell
# 用 wscript 隐藏启动（vbs 包装），登录时无任何 cmd/powershell 窗口
$action = New-ScheduledTaskAction -Execute 'wscript.exe' `
  -Argument '"<仓库路径>\scripts\start-dsh.vbs"'
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName 'dsh-web' -Action $action -Trigger $trigger -Settings $settings -Force
```

> 💡 **为什么用 wscript + vbs**：计划任务直接执行 `powershell.exe -WindowStyle Hidden` 时，
> 隐藏标志在登录场景下**不生效**，会弹出两个"空的 powershell 窗口"（内容被重定向到日志，
> 所以看起来是空白；且这些窗口与 Windows 默认终端机制叠加还会导致误杀服务进程）。
> `start-dsh.vbs` 用 `WshShell.Run(..., 0, False)`（SW_HIDE）启动，**登录时零窗口**。
> 2026-08-15 已在本机验证：网关（同款 vbs 方式）启动后无任何新窗口。

脚本行为：登录时启动 dsh web（直接以 node 运行，无 cmd.exe 包装）；进程崩溃 10 秒后自动重启；端口被占用则退出避免双实例。日志：`~/.dsh/logs/dsh-web.log`。

管理命令：

| 操作 | 命令 |
|---|---|
| 查看任务 | `Get-ScheduledTask -TaskName dsh-web` |
| 立即启动 | `schtasks /run /tn dsh-web` |
| 重启（先结束再拉起） | `schtasks /end /tn dsh-web`（看门狗 10 秒后自动重启） |
| 停用自启 | `Unregister-ScheduledTask -TaskName dsh-web` |

## 4. 彻底停用（恢复原始状态）

```powershell
# 1. 停用 dsh 自启
Unregister-ScheduledTask -TaskName dsh-web

# 2. 关闭 serve 转发（手机立即无法访问）
tailscale serve --https=443 off
tailscale serve status    # 应显示 No serve config

# 3. 恢复 dsh 信任围栏：把 cordis.patch.yml 恢复为初始内容
#    （热重载生效，无需重启 dsh）
#    初始内容：
#    -------
#    # Your patch layer for this dsh profile, applied after every bundle layer:
#    # a top-level YAML array of loader patch entries (id-targeted config
#    # overrides, disables, and insert lists; `!!js` expressions allowed).
#    []
#    -------

# 4.（可选）退出/卸载 Tailscale：电脑 tailscale logout；手机退出账号或卸载
```

验证恢复：手机打不开原地址；电脑本地 `http://127.0.0.1:3080` 正常；
`curl -H "Host: <任意tailnet地址>" http://127.0.0.1:3080/api/session.list` 返回 `403`。

> 注意：本机同时启用了**方式二（M2）** 时，其挂载的 `mobile-fit` 插件行也在
> `cordis.patch.yml` 中，恢复时一并删除；若启用了**方式三（M3）**，网关自启任务
> 需单独停用（见对应教程）。

## 5. 安全边界

- 仅 tailnet 内设备可达（Tailscale 设备身份 = 认证）；
- `/api` 围栏拒绝未命中 trustedHosts 的请求（防 DNS rebinding）；
- 特权方法（settings / credentials / host.*）仍被上游钉在 loopback；
- **禁止** `tailscale funnel`（会把服务暴露到公网）。
