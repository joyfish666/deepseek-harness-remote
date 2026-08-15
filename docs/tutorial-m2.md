# 方式二（M2）：自建远程网关 + 手机 App（PWA）

> **状态：🚧 开发中**。独立方案，**不是 M1 的替代或升级**。日常使用请用方式一（M1）。

## 1. 它是什么

M2 = 自建网关（`remote-gateway/`）+ 移动端 PWA。手机像原生 App 一样使用
（可"添加到主屏幕"、全屏、无地址栏），但会话、项目、模型调用全部在电脑上运行。

```
手机浏览器（PWA）
   │  HTTPS + Bearer Token（REST + SSE）
   ▼
remote-gateway（Node ≥22 零依赖，监听 127.0.0.1:3100）
   │  官方 /api 协议（RPC 信封 + events.mux/host 事件流）
   ▼
dsh web（127.0.0.1:3080）
```

- 入口：`https://<机器名>.<tailnet>.ts.net/m/`（与 M1 的 `/` 并存）；
- 带密码登录（HMAC 令牌）、限流、审计日志（`~/.dsh/logs/gateway-audit.log`）；
- 功能：新建会话、工作区与文件浏览、同步会话、搜索、命令、模型选择、图片消息、
  审批推送、停止/删除/目标、中英双语。

## 2. 启用

### 前置

- 已完成 **M1**（Tailscale 组网 + serve + trustedHosts 均就绪）；
- 需要 dsh 的 browse 能力（文件浏览）：在 `cordis.patch.yml` 中把目录选择器从
  native 换为 browse（见下），**副作用：电脑端"选择工作区"也改为浏览器内浏览**
  （官方 seam 换点）——这是 M2 与 M1 桌面端体验的已知冲突点。

### 步骤

1. **启动网关**（电脑上）：

   ```sh
   cd remote-gateway
   node server.js
   ```

   网关只监听 `127.0.0.1:3100`，由 tailscale serve 的 `/m` 路径对外。

2. **设置访问密码**：编辑 `remote-gateway/.env`，把 `GATEWAY_PASSWORD=` 改成
   你自己的密码（建议 8 位以上），保存后**重启网关**生效。

3. **手机访问**（Tailscale 保持连接）：浏览器打开

   ```
   https://<你的机器名>.<你的tailnet>.ts.net/m/
   ```

   右上角 **⚙ 设置** → 输入密码 → **保存并登录**。Chrome 菜单 → **添加到主屏幕**
   后可全屏使用。

4. **验证**：手机上能看到与电脑端相同的会话列表；新建会话 → 发消息 → 实时看到流式回复。

## 3. 开机自启

```powershell
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "<仓库路径>\scripts\start-gateway.ps1"'
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName 'dsh-gateway' -Action $action -Trigger $trigger -Settings $settings -Force
```

- 脚本自动定位到 `remote-gateway/` 目录（无需传 `-WorkDir`）；
- 崩溃 10 秒后自动重启；3100 被占用则退出避免双实例；
- 日志：`~/.dsh/logs/gateway.log`；审计：`~/.dsh/logs/gateway-audit.log`；
- dsh 重启后网关自动重连（指数退避）。

管理命令：

| 操作 | 命令 |
|---|---|
| 查看任务 | `Get-ScheduledTask -TaskName dsh-gateway` |
| 立即启动 | `schtasks /run /tn dsh-gateway` |
| 停用自启 | `Unregister-ScheduledTask -TaskName dsh-gateway` |
| 查看日志 | `Get-Content $HOME\.dsh\logs\gateway.log -Tail 50` |

## 4. 彻底停用（恢复原始状态）

```powershell
# 1. 停用网关自启（若已注册）
Unregister-ScheduledTask -TaskName dsh-gateway

# 2. 关闭 /m 转发（手机立即无法访问 M2；M1 的 / 不受影响）
tailscale serve --https=443 off
tailscale serve --bg 3080    # 重新只保留 / 转发

# 3. 恢复目录选择 seam（M2 专属改动，撤销后电脑端恢复原生目录选择器）：
#    编辑 ~/.dsh/profiles/web/cordis.patch.yml，删除以下两段：
#      - id: directory-picker
#        disabled: true
#      - insert:
#          - id: directory-picker-browse
#            name: '@deepseek-ai/dsh-host-directory-picker-browse'
#    （热重载生效，无需重启 dsh）

# 4. 删除网关目录与凭据（可选）
Remove-Item -Recurse -Force <仓库路径>\remote-gateway
```

## 5. 已知说明与冲突

- **与 M1 的冲突**：启用 M2 需要把目录选择器换成 browse seam，会改变 M1 桌面端
  "选择工作区"的交互（浏览器内浏览）。若你不需要 M2 的文件浏览，可以不做这个
  改动（M2 其余功能不受影响）。
- **与 M3 的关系**：完全独立，互不影响。M2 是换一套界面（`/m/`），M3 是给 M1
  官方界面加移动端适配（`/`）。
- **网关 API**：`POST /api/login`、`GET /api/health`、`GET/POST /api/sessions`、
  `POST /api/sessions/:id/prompt|cancel|selectModel|rename|fork|archive|goals`、
  `GET /api/search`、`GET /api/workspaces`、`GET /api/workspaces/:id/files`、
  `GET /api/models|providers|presets`、`POST /api/approvals/:rpcId`、
  `GET /api/stream?token=`（SSE）。详见 `remote-gateway/` 源码与验收脚本
  `remote-gateway/tests/e2e.mjs`。
