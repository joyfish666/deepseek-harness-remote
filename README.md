# deepseek-harness-remote

在本地运行 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）的基础上，实现**远程控制**：让手机、平板、其他电脑通过网络远程启动任务、查看运行状态、管理会话。

本仓库提供**三种方式**，按需选用（可同时启用）：

| | 方式一（M1） | 方式二（M2） | 方式三（M3） |
|---|---|---|---|
| 名称 | **Tailscale 隧道 + 官方 Web UI** | **M1 手机 UI 适配层** | **自建远程网关 + 手机 App（PWA）** |
| 形态 | **原生网站**：dsh 官方 Web UI 原样（零自建代码），只是经隧道送到手机 | 给 M1 官方界面注入移动端适配（`mobile-fit/` 插件） | 自建网关 + 移动端 App 界面（`remote-gateway/`） |
| 入口 | `https://<机器名>.<tailnet>.ts.net/` | 复用 M1 入口 `/` | `https://<机器名>.<tailnet>.ts.net/m/` |
| 状态 | ✅ **完全可用（唯一完成）** | ✅ **基本可用（移动端日常使用）** | 🚧 开发中（未完成） |
| 定位 | **日常使用的正式入口** | 让 M1 在手机上更好用 | 试验性移动端界面 |
| 手机上的界面 | 与电脑完全一致（官方原样） | 官方界面 + 移动端适配 | 自建移动端 UI（PWA） |

> ⚠️ **重要说明**：
>
> 1. **M1、M2 均可用**：M1 是原生网站（完全可用）；M2（手机 UI 适配层）经多轮打磨后
>    已覆盖手机日常使用（抽屉导航、会话操作、输入、设置面板等，见
>    [docs/tutorial-m2.md](docs/tutorial-m2.md) 行为清单）。**M3 未完成**——2026-08-15
>    解决的是"开机自启弹窗口"的部署问题（vbs 隐藏方式，见各教程第 3 节），网关与 App
>    本身仍在开发中，可能存在未知问题。
> 2. **M2/M3 不是比 M1 更好的替代品**。三者是完全独立的方案，互不替代；M1 是原生网站，M2 只是给 M1 做手机适配（介于 M1 与自建网关之间），M3 是自建 App 界面。
> 3. **冲突提示**：
>    - M1 与 M2 无冲突（M2 是 M1 的叠加层）；M3 与 M1/M2 入口不同（`/m/` vs `/`），可并存。
>    - **M3 的已知冲突**：启用 M3 文件浏览需要把 dsh 目录选择器从 native 换成 browse seam，会改变 **M1 电脑端**"选择工作区"的交互（改为浏览器内浏览）。若不需要 M3 文件浏览可不做该改动。
>    - 三者共用 `~/.dsh/profiles/web/cordis.patch.yml`，停用某一方式时注意只删自己的配置段（见各教程）。
> 4. **远程访问的已知限制**（M1/M2 通用，dsh 上游安全设计）：配置/凭据类接口
>    （模型页、插件配置、权限、Agent 预设等）仅限本机回环（localhost/127.0.0.1）访问，
>    经远程域名访问会返回 HTTP 403。手机端无法使用这些页面；M2 会在设置面板顶部
>    显示说明横幅。电脑上用 `http://127.0.0.1:<端口>` 访问即可正常使用。

## 使用教程

| 方式 | 教程 | 内容 |
|---|---|---|
| 方式一（M1）✅ | [docs/tutorial-m1.md](docs/tutorial-m1.md) | 原理、启用步骤、**开机自启**、**彻底停用** |
| 方式二（M2）🚧 | [docs/tutorial-m2.md](docs/tutorial-m2.md) | 原理、启用步骤、**开机自启**、**彻底停用** |
| 方式三（M3）🚧 | [docs/tutorial-m3.md](docs/tutorial-m3.md) | 原理、启用步骤、**开机自启**、**彻底停用** |

快速上手（M1，推荐先看）：[docs/tutorial-m1.md](docs/tutorial-m1.md)。

---

## 目录结构

| 路径 | 说明 |
|---|---|
| `remote-gateway/` | **M3 网关**：零依赖 Node 服务（REST + SSE）+ 移动端 PWA（`public/`）+ 端到端验收脚本（`tests/e2e.mjs`） |
| `mobile-fit/` | **M2 适配层**：注入式 client 插件，让 M1 官方界面在手机上更好用（零上游改动，纯叠加；行为清单见 `docs/tutorial-m2.md` 第 5 节） |
| `scripts/` | 开机自启：`start-dsh.vbs` / `start-gateway.vbs`（wscript 隐藏启动器，任务注册用）+ `start-dsh.ps1` / `start-gateway.ps1`（看门狗本体） |
| `docs/tutorial-m1.md` / `tutorial-m2.md` / `tutorial-m3.md` | 三种方式各自的使用教程（启用 / 自启 / 停用） |
| `docs/remote-control-plan.md` | 远程控制整体方案：架构调研、方案对比、路线图与实施记录 |
| `docs/pitfalls.md` | **踩坑记录**：所有已知坑的根源与对策（改相关代码前必读） |
| `deepseek-harness-master/` | 官方上游代码（**仅本地参考，不推送 GitHub**，已加入 `.gitignore`） |

## 安全说明（所有方式通用）

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
| 网关页面 401 / 连不上（M3） | 检查 `remote-gateway/.env` 的 `GATEWAY_PASSWORD` 与手机输入是否一致；`Get-ScheduledTask -TaskName dsh-gateway` 查看任务状态；`schtasks /run /tn dsh-gateway` 立即启动 |
| 网关日志（M3） | `Get-Content $HOME\.dsh\logs\gateway.log -Tail 50`；审计：`gateway-audit.log` |
| 页面显示 "Failed to load plugins"（M2） | mobile-fit 插件未生效：确认 junction 存在（`Get-Item "$HOME\.dsh\profiles\web\node_modules\mobile-fit"`）、patch 行正确，然后**重启 dsh**（`schtasks /end /tn dsh-web`） |
| 设置页"模型/插件配置"报 403 或空白（M1/M2 远程访问） | **dsh 上游安全设计**：配置/凭据接口仅限本机回环访问，远程域名访问一律 403，非配置问题。手机端无法使用；请在运行 dsh 的电脑浏览器打开 `http://127.0.0.1:<端口>` |
| 内测声明每次刷新都弹出（远程访问） | 上游在远程浏览器下仅内存保存"已确认"状态；M2 已用 localStorage 持久化，**点一次"继续"后不再弹出**。若更新了上游声明版本号，会再提示一次属正常 |
| 开机出现 cmd.exe / 空白 powershell 窗口（旧版自启） | ⚠️ **2026-08-15 已根治**：自启任务已改为 `wscript.exe + .vbs`（SW_HIDE）启动，登录时零窗口。若仍看到 `cmd.exe /d /s /c dsh web` 或空白的 `powershell.exe` 窗口，说明任务还是旧方式——按教程第 3 节重新注册（`wscript.exe` + `start-dsh.vbs` / `start-gateway.vbs`）并重启电脑。另有一个 `cmd.exe /C AMDRSServ.exe` 窗口是 AMD 显卡驱动，与项目无关，可关闭 |

## 路线图

- [x] M1：Tailscale 隧道 + 官方 Web UI 远程访问——**完全可用，日常使用入口**
- [x] M2：M1 手机 UI 适配层（`mobile-fit/`）——**基本可用，手机日常使用**（抽屉导航、会话操作、输入体验、设置面板全屏化、内测声明持久化、上游安全提示横幅等，持续打磨中）
- [ ] M3：自建远程网关 + 手机 App（PWA）——**开发中**（独立方案，非 M1 的替代/升级）

## 许可证

[MIT](LICENSE)
