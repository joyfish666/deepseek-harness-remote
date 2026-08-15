# deepseek-harness-remote

基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）的
**Web 远程访问与移动端适配**项目：

- ✅ **电脑网页端访问**：dsh Web 界面直接可用（本机 `http://127.0.0.1:3080`，
  远程经 Tailscale 隧道 `https://<机器名>.<tailnet>.ts.net/`）；
- ✅ **手机网页端适配（mobile-fit）**：同一入口，窄屏自动启用移动端布局——
  抽屉导航、会话操作、输入体验、设置面板全屏化等（行为清单见
  [docs/tutorial-m2.md](docs/tutorial-m2.md) 第 5 节）；
- 🚧 **后续计划：APK（安卓原生壳）**。

> ⚠️ **重要说明**：
>
> 1. **本项目无需修改源 dsh 代码**——官方前端 dist 与 dsh 本体零改动，mobile-fit
>    只是通过官方 client 插件 seam 注入的叠加层（纯 CSS + 少量交互 JS）。
> 2. **上游 dsh 源码更新后，本项目会同步适配**（类名后缀 / 槽名 / 接口变化时更新
>    `mobile-fit/lib/client.js` 并回归行为清单）。
> 3. **远程访问的已知限制（dsh 上游安全设计）**：配置/凭据类接口（模型页、插件
>    配置、权限、Agent 预设等）仅限本机回环（localhost/127.0.0.1）访问，经远程
>    域名访问会返回 HTTP 403。手机端无法使用这些页面；mobile-fit 会在设置面板
>    顶部显示说明横幅。电脑上用 `http://127.0.0.1:<端口>` 访问即可正常使用。

## 快速开始

完整教程：[docs/tutorial-m2.md](docs/tutorial-m2.md)（部署 dsh Web → Tailscale
serve + trustedHosts → 开机自启 → 启用手机适配）。

核心步骤速览：

```powershell
# 1. 组网（可选）：电脑与手机登录同一 Tailscale 账号

# 2. 启用 serve（首次需网页授权一次）
tailscale serve --bg 3080

# 3. 信任围栏：~/.dsh/profiles/web/cordis.patch.yml 追加
#    - id: connection
#      config:
#        trustedHosts: !!js "['<机器名>.<tailnet>.ts.net', ...ctx.webRuntime.trustedHosts]"

# 4. 挂载手机适配插件（junction，改代码即生效）
$nm = "$HOME\.dsh\profiles\web\node_modules"
New-Item -ItemType Directory -Force $nm | Out-Null
cmd /c mklink /J "$nm\mobile-fit" "<仓库路径>\mobile-fit"
#    并在 cordis.patch.yml 末尾追加：
#    - insert:
#        - id: mobile-fit
#          name: 'mobile-fit'

# 5. 重启 dsh web（看门狗 10 秒后自动拉起）
schtasks /end /tn dsh-web
```

## 目录结构

| 路径 | 说明 |
|---|---|
| `mobile-fit/` | **手机适配层**：注入式 client 插件（零上游改动，纯叠加；行为清单见 `docs/tutorial-m2.md` 第 5 节） |
| `scripts/` | 开机自启：`start-dsh.vbs` / `start-dsh.ps1`（wscript 隐藏启动器 + 看门狗，登录零窗口） |
| `docs/tutorial-m2.md` | 完整教程：部署 / 手机适配 / 自启 / 停用 / 行为清单 / 自定义 |
| `docs/pitfalls.md` | **踩坑记录**：所有已知坑的根源与对策（改相关代码前必读） |
| `deepseek-harness-master/` | 官方上游源码（**仅本地参考，不推送 GitHub**，已加入 `.gitignore`） |

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
| 设置页"模型/插件配置"报 403 或空白（远程访问） | **dsh 上游安全设计**：配置/凭据接口仅限本机回环访问，远程域名访问一律 403，非配置问题。手机端无法使用；请在运行 dsh 的电脑浏览器打开 `http://127.0.0.1:<端口>` |
| 内测声明每次刷新都弹出（远程访问） | 上游在远程浏览器下仅内存保存"已确认"状态；mobile-fit 已用 localStorage 持久化，**点一次"继续"后不再弹出**。若更新了上游声明版本号，会再提示一次属正常 |
| 页面显示 "Failed to load plugins" | mobile-fit 插件未生效：确认 junction 存在（`Get-Item "$HOME\.dsh\profiles\web\node_modules\mobile-fit"`）、patch 行正确，然后**重启 dsh**（`schtasks /end /tn dsh-web`） |
| 命令行找不到 `tailscale` | Windows 上使用完整路径：`C:\Program Files\Tailscale\tailscale.exe` |
| 想用 IP 访问 | 不支持，请用域名 |
| 重启电脑后手机连不上 | 确认 Tailscale 已随系统启动、`tailscale serve status` 显示运行中（serve 配置持久保存，通常无需重配） |
| 开机出现 cmd.exe / 空白 powershell 窗口（旧版自启） | ⚠️ 已根治：自启任务已改为 `wscript.exe + .vbs`（SW_HIDE）启动，登录时零窗口。若仍看到旧式窗口，按教程第 2 节第 5 步重新注册并重启电脑。另有一个 `cmd.exe /C AMDRSServ.exe` 窗口是 AMD 显卡驱动，与项目无关，可关闭 |

## 路线图

- [x] 电脑网页端访问：dsh Web 部署 + Tailscale serve + 信任围栏 + 开机自启
- [x] 手机网页端适配（mobile-fit）：抽屉导航、会话操作、输入体验、设置面板全屏化、内测声明持久化、上游安全提示横幅等
- [ ] APK：安卓原生壳（WebView + 通知），沿用现有适配层与部署链路

## 许可证

[MIT](LICENSE)
