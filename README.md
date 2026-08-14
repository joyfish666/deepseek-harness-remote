# deepseek-harness-remote

在本地运行 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）的基础上，实现**远程控制**：让手机、平板、其他电脑通过网络远程启动任务、查看运行状态、管理会话。

当前已实现 **M1：Tailscale 隧道 + 官方 Web UI**——无需改动 dsh 任何代码，手机浏览器即可获得与电脑一致的完整控制界面。后续规划见 [方案文档](docs/remote-control-plan.md)（自建移动端网关等）。

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

## 目录结构

| 路径 | 说明 |
|---|---|
| `docs/remote-control-plan.md` | 远程控制整体方案：架构调研、方案对比（隧道 / 网关 / 插件）、路线图（M1 已完成，M2 自建网关规划中） |
| `deepseek-harness-master/` | 官方上游代码（**仅本地参考，不推送 GitHub**，已加入 `.gitignore`） |

## 路线图

- [x] M1：Tailscale 隧道 + 官方 Web UI 远程访问（本仓库即指南）
- [ ] M2：自建远程网关（移动端友好界面 + Token 认证 + HTTPS，见方案文档）
- [ ] M3：可选——dsh 外部插件补强能力

## 许可证

[MIT](LICENSE)
