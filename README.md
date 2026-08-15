# deepseek-harness-remote

在本地运行 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）的基础上，实现**远程控制**：让手机、平板、其他电脑通过网络远程启动任务、查看运行状态、管理会话。

当前状态：

- **M1（✅ 完全可用）：Tailscale 隧道 + 官方 Web UI**——无需改动 dsh 任何代码，手机浏览器即可获得与电脑一致的完整控制界面。**M1 就是 dsh 官方原生的网站本身**（原生网站），只是通过 Tailscale 隧道把它安全地送到手机上。**日常使用请认准 M1。**
- **M2（🚧 开发中）：手机 App（自建网关 + PWA）**——`remote-gateway/` 零依赖网关 + 移动端应用：新建会话、查看工作区与文件、同步会话、发消息与命令、模型选择、审批、多语言（跟随系统），带 Token 认证与审计日志。

> ⚠️ **重要：M2 还在开发中，M1 已经完全可用。**
>
> **M2 并不是比 M1 更好，两者是完全独立的两套方案，互不依赖、互不替代：**
>
> | | M1 | M2 |
> |---|---|---|
> | 形态 | **原生网站**（dsh 官方 Web UI 原样，零自建代码） | 自建网关 + 手机 App（PWA） |
> | 入口 | `https://<机器名>.<tailnet>.ts.net/` | `https://<机器名>.<tailnet>.ts.net/m/` |
> | 状态 | ✅ 完全可用，最稳定 | 🚧 开发中，功能仍在打磨 |
> | 定位 | 日常使用的正式入口 | 试验性移动端界面 |
>
> 遇到任何问题请优先使用 M1；M2 仅作开发验证用途。

后续规划见 [方案文档](docs/remote-control-plan.md)。

---

## 快速上手：手机远程访问电脑上的 DeepSeek Harness

> 以下步骤从零开始，全程不修改 dsh 源码，约 10 分钟完成。

### 准备

| 端 | 要求 |
|---|---|
| 电脑 | Node.js 已安装，`npx @deepseek-ai/dsh web` 可正常启动（默认 `http://127.0.0.1:3080`） |
| 手机 | 安卓 / iOS，安装 [Tailscale](https://tailscale.com/download) App |
| 账号 | 一个 Tailscale 账号（免费版即可），电脑与手机登录同一账号 |

### 第 1 步：组网（Tailscale）

1. 电脑安装 Tailscale 并登录；手机安装 Tailscale App 并登录**同一账号**。
2. 验证：电脑终端运行 `tailscale status`，应能看到电脑和手机两台设备（各有 `100.x.y.z` 形式的 IP）。

### 第 2 步：一次性启用 Serve 功能

Tailscale 的 Serve（内网服务分享）默认关闭，需管理员授权一次：

1. 电脑终端运行 `tailscale serve --bg 3080`，终端会打印一个形如 `https://login.tailscale.com/f/serve?node=xxxx` 的链接。
2. 用浏览器打开该链接（登录你的 Tailscale 账号），点击 **Enable**。
3. 重新运行 `tailscale serve --bg 3080`，看到 `Serve started and running in the background` 即成功。

### 第 3 步：配置 dsh 信任围栏（trustedHosts）

dsh 的 `/api` 接口有信任围栏：只有 `Host` 为 loopback 或命中 `trustedHosts` 的请求才会放行。需要把 Tailscale 域名加进白名单。

1. 查看你自己的 Tailscale 域名：`tailscale serve status`，输出里的 `https://<你的机器名>.<你的tailnet>.ts.net/` 就是最终访问地址。
2. 编辑 dsh 的 profile 补丁文件：
   - Windows：`%USERPROFILE%\.dsh\profiles\web\cordis.patch.yml`
   - Linux / macOS：`~/.dsh/profiles/web/cordis.patch.yml`
   - 不存在则新建，内容：

   ```yaml
   - id: connection
     config:
       trustedHosts: !!js "['<你的机器名>.<你的tailnet>.ts.net', ...ctx.webRuntime.trustedHosts]"
   ```

   > ⚠️ 格式坑：`!!js` 标签只接受单个 YAML 标量，**整个表达式必须用双引号包裹成字符串**；写成带空格的裸数组会导致 dsh 启动解析失败（fail-loud）。修改前建议先备份原文件。

3. **无需重启 dsh**：该文件由 dsh 热重载（Cordis HMR），写入后几秒内自动生效。
4. 验证（可选）：`curl -s -o NUL -w "%{http_code}" -H "Host: <你的机器名>.<你的tailnet>.ts.net" http://127.0.0.1:3080/api/session.list`——返回 `404` 表示围栏已放行（404 是路径不合法，属正常）；换成任意陌生 Host 应返回 `403`。

### 第 4 步：启动转发

```sh
tailscale serve --bg 3080
```

将 tailnet 上的 HTTPS 端口转发到本机 `127.0.0.1:3080`（dsh 保持只监听本机，不暴露到局域网/公网）。

### 第 5 步：手机访问

手机浏览器（保持 Tailscale App 连接）打开：

```
https://<你的机器名>.<你的tailnet>.ts.net/
```

> ⚠️ 请使用上面的**域名**，不要用 `https://<IP>/`：Tailscale Serve 只为域名签发 TLS 证书，IP 直连会被拒绝（Tailscale 限制，非配置错误）。

### 完成 🎉

手机端获得与电脑一致的完整 GUI：新建会话、发送任务、查看实时状态（消息流、令牌用量、工具调用）、处理审批请求，全部可用。

---

---

## 手机 App（M2：自建网关 + PWA）——🚧 开发中

> ⚠️ **M2 仍在开发中，目前不以它为准**；日常使用请用上面的 M1（原生网站）。M2 不是 M1 的替代或升级，两者完全独立。
> 在手机上像原生 App 一样使用的移动端客户端（PWA：可"添加到主屏幕"，全屏独立运行，无地址栏）。会话、项目、模型调用全部在电脑上运行，手机只是遥控器与显示器。

### 功能

| 功能 | 说明 |
|---|---|
| 新建会话 | 选择工作区/工作目录/**Agent 预设** |
| 查看工作区 | 工作区列表 + **文件浏览/新建文件夹**（仅限工作区内，越界拒绝）+ 重命名/删除工作区 |
| 同步会话 | 与电脑端实时同步：同一批会话，双向可见，状态实时刷新 |
| 搜索会话 | 会话**内容全文搜索**（结果带摘要） |
| 输入命令 | 消息以 `/` 开头即执行斜杠命令（与电脑端一致） |
| 模型选择 | 模型目录 + **推理等级**（如 DeepSeek 思考等级）按会话切换 |
| 图片消息 | 📎 从手机相册发送图片（需模型支持视觉） |
| 审批 | 需要审批的操作推送到手机，远程"允许一次 / 拒绝" |
| 停止/删除/目标 | 停止运行、删除会话（归档）、设置目标 |
| 多语言 | 中文 / English，默认跟随系统语言，可手动切换 |

### 使用步骤

1. **启动网关**（电脑上）：

   ```sh
   cd remote-gateway
   node server.js
   ```

   > 网关零依赖（Node ≥ 22 内置能力），只监听 `127.0.0.1`。已配置开机自启任务 `dsh-gateway`（见下节）。

2. **设置访问密码**：打开 `remote-gateway/.env`，把 `GATEWAY_PASSWORD=` 改成**你自己设置的密码**（建议 8 位以上），保存后**重启网关**生效（改密码后手机端需重新登录）。

3. **手机访问**（Tailscale 保持连接）：浏览器打开

   ```
   https://<你的机器名>.<你的tailnet>.ts.net/m/
   ```

   点右上角 **⚙ 设置** → 输入密码 → **保存并登录**。语言切换（中文/English，默认跟随系统）也在设置里。Chrome 菜单 → **添加到主屏幕** 后即可像 App 一样全屏使用。

4. **验证**：手机上能看到与电脑端相同的会话列表；新建会话 → 发一条消息 → 实时看到流式回复。

### 网关 API（开发者参考）

| 端点 | 说明 |
|---|---|
| `POST /api/login` | 登录：`{password}` → `{token}`（密码错误 401，限流防爆破） |
| `POST /api/password` | 修改密码：`{oldPassword, newPassword}` → 新令牌（写入 `.env` 并热更新，旧令牌立即失效） |
| `GET /api/health` | 网关与 dsh 连接状态 |
| `GET /api/sessions` / `POST /api/sessions` | 会话列表 / 新建（`{workspaceId?, cwd?, agentPreset?}`） |
| `POST /api/sessions/:id/archive` | 归档会话（从所有列表消失；数据完整保留，但协议无取消归档/真删除，桌面端同理） |
| `GET /api/search?q=` | 会话内容全文搜索 |
| `GET /api/sessions/:id/history` | 会话历史 |
| `POST /api/sessions/:id/prompt` | 发消息 `{text, images?: [{mediaType, data, name}], mode?}`（`/` 开头为命令） |
| `POST /api/sessions/:id/cancel` | 停止运行 |
| `POST /api/sessions/:id/selectModel` | 切换模型 `{provider, model, reasoningEffort?}`（推理等级可选） |
| `POST /api/sessions/:id/rename` / `fork` | 重命名 / 派生副本 |
| `POST /api/sessions/:id/goals` | 设置目标 `{objective, maxGoalRounds?}` |
| `GET /api/workspaces` / `POST /api/workspaces` | 工作区列表 / 添加 |
| `POST /api/workspaces/:id/rename` / `DELETE /api/workspaces/:id` | 重命名 / 删除工作区 |
| `GET /api/workspaces/:id/files?path=` | 工作区文件浏览（越界 403） |
| `POST /api/workspaces/:id/folder` | 工作区内新建文件夹 `{name, path?}` |
| `GET /api/presets` | Agent 预设列表（新建会话选择） |
| `GET /api/models` / `GET /api/providers` | 模型目录 / 提供商 |
| `POST /api/approvals/:rpcId` | 审批应答 `{sessionId, approvalId, outcome}` |
| `GET /api/stream?token=` | SSE 实时事件流（mux/host 帧） |

认证：先 `POST /api/login` 换取会话令牌（HMAC 签发，30 天有效，重启网关不失效），此后请求带 `Authorization: Bearer <token>`（SSE 用 `?token=`）；无令牌一律 401；访问审计写入 `~/.dsh/logs/gateway-audit.log`。修改 `GATEWAY_PASSWORD` 后旧令牌立即失效。

### 已知说明

- 启用文件浏览需要 dsh 的 browse 能力：已在 `~/.dsh/profiles/web/cordis.patch.yml` 中将目录选择器从 native 换为 browse（副作用：电脑端"选择工作区"也改为浏览器内浏览，属官方 seam 换点）。
- 网关与 dsh 之间走官方 `/api` 协议（RPC 信封 + events.mux/host 事件流），dsh 重启后网关自动重连。

## 开机自启（推荐）

重启电脑后，**Tailscale 服务和 serve 转发会自动恢复**（Tailscale 是系统服务，serve 配置持久保存），但 **dsh 本体与网关不会自启**，需要手动配置。仓库提供了自启脚本 `scripts/start-dsh.ps1`（dsh）与 `scripts/start-gateway.ps1`（M2 网关）：

1. 注册计划任务（登录时自动启动；进程崩溃后 10 秒自动重启；若端口已被占用则直接退出避免双实例）：

   ```powershell
   # dsh（M1，端口 3080）
   $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
     -Argument '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "<仓库路径>\scripts\start-dsh.ps1"'
   $trigger = New-ScheduledTaskTrigger -AtLogOn
   $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)
   Register-ScheduledTask -TaskName 'dsh-web' -Action $action -Trigger $trigger -Settings $settings -Force

   # 网关（M2，端口 3100）
   $action2 = New-ScheduledTaskAction -Execute 'powershell.exe' `
     -Argument '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "<仓库路径>\scripts\start-gateway.ps1"'
   Register-ScheduledTask -TaskName 'dsh-gateway' -Action $action2 -Trigger $trigger -Settings $settings -Force
   ```

   > 网关脚本会自行定位到 `remote-gateway/` 目录（脚本位于 `<仓库路径>\scripts\`，自动推导上级目录下的 `remote-gateway`），无需手动传 `-WorkDir`。
   > ⚠️ **历史坑**：早期版本默认在脚本所在目录（`scripts/`）启动 `node server.js`，导致找不到 `server.js` 启动失败（表现为重启后手机能开 M1 但打不开 M2）。2026-08-15 已修复，旧任务无需重新注册，重启后自动生效。

2. 脚本日志：`~/.dsh/logs/dsh-web.log`（dsh）、`~/.dsh/logs/gateway.log`（网关，启动、退出码、重启记录）。
3. 管理命令：

   | 操作 | 命令 |
   |---|---|
   | 查看任务 | `Get-ScheduledTask -TaskName dsh-web, dsh-gateway` |
   | 立即启动（不重启） | `schtasks /run /tn dsh-gateway` |
   | 停用自启 | `Unregister-ScheduledTask -TaskName dsh-web; Unregister-ScheduledTask -TaskName dsh-gateway` |
   | 查看日志 | `Get-Content $HOME\.dsh\logs\gateway.log -Tail 50` |

---

## 取消远程访问（恢复到原始状态）

分两个层次：**暂时关闭**（配置保留，随时恢复）和**彻底还原**（撤销全部改动）。

### 方案 A：暂时关闭（推荐，随时可恢复）

```powershell
tailscale serve --https=443 off    # 关闭转发，手机立即无法访问
```

重新开启：`tailscale serve --bg 3080` 即可。dsh 和自启任务都无需改动。

### 方案 B：彻底还原（撤销全部配置）

按顺序执行：

1. **停用 dsh 开机自启**：

   ```powershell
   Unregister-ScheduledTask -TaskName dsh-web
   ```

2. **关闭并清除 serve 转发**：

   ```powershell
   tailscale serve --https=443 off
   tailscale serve status    # 应显示 No serve config
   ```

3. **恢复 dsh 信任围栏配置**：把 `~/.dsh/profiles/web/cordis.patch.yml`（Windows 为 `%USERPROFILE%\.dsh\...`）恢复为初始内容：

   ```yaml
   # Your patch layer for this dsh profile, applied after every bundle layer:
   # a top-level YAML array of loader patch entries (id-targeted config
   # overrides, disables, and insert lists; `!!js` expressions allowed).
   []
   ```

   补丁文件热重载生效，**无需重启 dsh**。

4. **（可选）退出/卸载 Tailscale**：电脑端 `tailscale logout`（或系统设置中卸载）；手机端退出账号或卸载 App。卸载会一并清除 serve 配置。

5. **验证恢复**：

   - 手机打开原地址 → 无法连接；
   - 电脑本地 `http://127.0.0.1:3080` → 一切正常；
   - 围栏回归：`curl -H "Host: <任意tailnet地址>" http://127.0.0.1:3080/api/session.list` → 返回 `403`。

6. **（可选）清理日志**：`Remove-Item $HOME\.dsh\logs\dsh-web.log`。

### 不受影响的部分

- 本仓库（README / 脚本）只是文档与工具，删除或保留都不影响电脑功能；彻底不要可删除 GitHub 远端仓库与本地 `.git` 目录。
- dsh 的会话、设置等数据不受任何影响。

---

## 安全说明

- **可达性**：仅同一 tailnet 内的设备可访问（Tailscale 设备身份 = 认证）；tailnet 之外不可达。
- **信任围栏**：dsh 的 `/api` 围栏拒绝未命中 `trustedHosts` 的请求（防 DNS rebinding / 未授权访问）。
- **特权保护**：设置、凭据管理、本机文件打开等特权方法仍被 dsh 钉在 loopback，远程设备无法调用。
- **禁止**使用 `tailscale funnel`（会把服务暴露到公网）。
- 停止共享：`tailscale serve --https=443 off`。

## 常见问题

| 现象 | 处理 |
|---|---|
| 手机打不开域名 | 检查手机 Tailscale App 是否已连接（VPN 图标）；确认与电脑同一账号 |
| 页面能开但功能报 403 | `trustedHosts` 未生效：检查补丁文件语法（`!!js` 引号坑）、确认域名与 `tailscale serve status` 输出完全一致 |
| 命令行找不到 `tailscale` | Windows 上使用完整路径：`C:\Program Files\Tailscale\tailscale.exe` |
| 想用 IP 访问 | 不支持，请用域名 |
| 重启电脑后手机连不上 | 确认 Tailscale 已随系统启动、`tailscale serve status` 显示运行中（serve 配置持久保存，通常无需重配） |
| 网关页面 401 / 连不上 | 检查 `remote-gateway/.env` 的 `GATEWAY_PASSWORD` 与手机输入是否一致；`Get-ScheduledTask -TaskName dsh-gateway` 查看任务状态；`schtasks /run /tn dsh-gateway` 立即启动 |
| 网关日志 | `Get-Content $HOME\.dsh\logs\gateway.log -Tail 50`；审计：`gateway-audit.log` |

## 目录结构

| 路径 | 说明 |
|---|---|
| `remote-gateway/` | **M2 网关**：零依赖 Node 服务（REST + SSE）+ 移动端 PWA（`public/`）+ 端到端验收脚本（`tests/e2e.mjs`） |
| `scripts/` | 开机自启脚本：`start-dsh.ps1`（dsh）、`start-gateway.ps1`（网关） |
| `docs/remote-control-plan.md` | 远程控制整体方案：架构调研、方案对比、路线图与 M1/M2 实施记录 |
| `docs/pitfalls.md` | **踩坑记录**：所有已知坑的根源与对策（改相关代码前必读） |
| `deepseek-harness-master/` | 官方上游代码（**仅本地参考，不推送 GitHub**，已加入 `.gitignore`） |

## 路线图

- [x] M1：Tailscale 隧道 + 官方 Web UI 远程访问（本仓库即指南）——**完全可用，日常使用入口**
- [ ] M2：自建远程网关 + 手机 App（PWA）：会话/工作区/文件/命令/模型/审批/多语言，Token 认证 + 审计——**开发中**（独立方案，非 M1 的替代/升级）
- [ ] M3：可选——dsh 外部插件补强能力（如全量事件、会话推送通知）

## 许可证

[MIT](LICENSE)
