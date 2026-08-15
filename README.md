# deepseek-harness-remote

基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）的
**Web 远程访问与移动端适配**项目：让 dsh 的 Web 界面在电脑与手机上都能方便地使用。

- ✅ **电脑网页端访问**：本机 `http://127.0.0.1:3080`；远程经 Tailscale 隧道
  `https://<机器名>.<tailnet>.ts.net/`
- ✅ **手机网页端适配（mobile-fit）**：同一入口，窄屏自动启用移动端布局（抽屉导航、
  会话操作、输入体验、设置面板全屏化等）
- 🚧 **后续计划**：APK（安卓原生壳）

> **重要说明**：本项目**无需修改源 dsh 代码**（纯叠加层）；上游 dsh 源码更新后，
> 本项目会**同步适配**。

## 如何开启远程控制（概览）

1. 安装 Node.js，确认 `npx @deepseek-ai/dsh web` 可启动；
2. 启动 dsh web，本机浏览器打开 `http://127.0.0.1:3080` 验证；
3. （手机远程访问，可选）Tailscale 组网 → `tailscale serve --bg 3080` →
   配置 `trustedHosts`；
4. （手机适配，可选）挂载 mobile-fit 插件。

**详细步骤（从 0 到可用，含卸载还原）请看 [docs/tutorial.md](docs/tutorial.md)。**

## 文档导航

| 文档 | 读者 | 内容 |
|---|---|---|
| [docs/tutorial.md](docs/tutorial.md) | **所有用户** | 从零部署到手机可用的完整教程；含手动启动与开机自启两种方式、彻底卸载还原 |
| [docs/pitfalls.md](docs/pitfalls.md) | **开发者 / 维护者**（仅使用的用户可跳过） | 踩坑记录：所有已知坑的根源与对策 |
| [mobile-fit/README.md](mobile-fit/README.md) | **开发者** | mobile-fit 插件包：原理、安装、自定义、已知说明 |

## 安全说明

- 仅同一 tailnet 内的设备可访问（Tailscale 设备身份 = 认证）；
- dsh `/api` 信任围栏（trustedHosts）防 DNS rebinding；
- 配置/凭据等特权接口被 dsh 钉在本机回环，远程无法调用（上游安全设计）；
- **禁止** `tailscale funnel`（会把服务暴露到公网）。

## 常见问题

| 现象 | 处理 |
|---|---|
| 手机打不开域名 | 检查手机 Tailscale App 已连接（VPN 图标）；确认与电脑同一账号 |
| 想用 IP 访问 | 不支持，请用域名 |
| 重启电脑后手机连不上 | 确认 Tailscale 随系统启动、`tailscale serve status` 显示运行中 |
| 页面能开但某些功能报 403 | 配置/凭据类页面（模型、插件配置、权限等）远程访问必然 403，属 dsh 上游安全设计，请在运行 dsh 的电脑上打开 `http://127.0.0.1:<端口>`；若基础功能也 403，则是 `trustedHosts` 未生效（见教程第 2 节） |
| 内测声明每次刷新都弹出 | 点一次"继续"后不再弹出（mobile-fit 已本地持久化）；上游更新声明版本时会再提示一次，属正常 |
| 页面显示 "Failed to load plugins" | mobile-fit 未生效：确认 junction 与 patch 行正确后重启 dsh（见教程第 3 节） |
| 命令行找不到 `tailscale` | Windows 用完整路径：`C:\Program Files\Tailscale\tailscale.exe` |
| 开机看到一个 cmd.exe 窗口 | 是 AMD 显卡驱动（`AMDRSServ.exe`），与项目无关，可关闭 |

## 路线图

- [x] 电脑网页端访问（部署 + Tailscale + 信任围栏 + 可选自启）
- [x] 手机网页端适配（mobile-fit）
- [ ] APK（安卓原生壳）

## 许可证

[MIT](LICENSE)

---

# deepseek-harness-remote

Remote web access and mobile adaptation for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`): make the dsh Web UI usable on both desktop and phone.

- ✅ **Desktop web access**: `http://127.0.0.1:3080` locally; remotely via Tailscale at `https://<machine>.<tailnet>.ts.net/`
- ✅ **Mobile web adaptation (mobile-fit)**: same entry point; narrow screens automatically get the mobile layout (drawer navigation, session actions, input experience, full-screen settings, etc.)
- 🚧 **Next**: APK (native Android shell)

> **Note**: this project **does not modify the dsh source** (a pure overlay). When upstream dsh changes, this project **adapts accordingly**.

## Getting remote control (overview)

1. Install Node.js and make sure `npx @deepseek-ai/dsh web` starts;
2. Start dsh web and verify at `http://127.0.0.1:3080` in a desktop browser;
3. (Optional, for phone access) Tailscale networking → `tailscale serve --bg 3080` → configure `trustedHosts`;
4. (Optional, for mobile UI) mount the mobile-fit plugin.

**Full step-by-step guide (from zero to working, including uninstall/rollback): [docs/tutorial.md](docs/tutorial.md).**

## Documentation map

| Document | Audience | Content |
|---|---|---|
| [docs/tutorial.md](docs/tutorial.md) | **All users** | Complete guide from zero to phone-ready; manual start and autostart options; full uninstall/rollback |
| [docs/pitfalls.md](docs/pitfalls.md) | **Developers / maintainers** (users can skip) | Pitfall log: root causes and fixes for every known issue |
| [mobile-fit/README.md](mobile-fit/README.md) | **Developers** | The mobile-fit plugin package: how it works, install, customization, known notes |

## Security notes

- Only devices in the same tailnet can reach the service (Tailscale device identity = authentication);
- The dsh `/api` trust fence (`trustedHosts`) prevents DNS rebinding;
- Configuration/credential privileged APIs stay pinned to loopback by dsh (upstream security design);
- **Never** use `tailscale funnel` (it would expose the service to the public internet).

## FAQ

| Symptom | Fix |
|---|---|
| Phone can't open the domain | Make sure the phone's Tailscale app is connected (VPN icon) and logged into the same account as the PC |
| Want to use an IP address | Not supported — use the domain name |
| Phone can't connect after reboot | Make sure Tailscale starts with Windows and `tailscale serve status` shows running |
| Page opens but some features return 403 | Config/credential pages (Models, plugin config, permissions, etc.) always return 403 remotely — that's dsh's upstream security design; open `http://127.0.0.1:<port>` on the machine running dsh instead. If basic features also 403, `trustedHosts` is not effective (see tutorial section 2) |
| The internal-testing notice pops up on every refresh | It stops after clicking "Continue" once (mobile-fit persists it locally); it reappears once after an upstream copy-version bump, which is expected |
| Page shows "Failed to load plugins" | mobile-fit is not active: verify the junction and patch line, then restart dsh (see tutorial section 3) |
| `tailscale` command not found | On Windows use the full path: `C:\Program Files\Tailscale\tailscale.exe` |
| A cmd.exe window appears at startup | It's the AMD graphics driver (`AMDRSServ.exe`), unrelated to this project; safe to close |

## Roadmap

- [x] Desktop web access (deployment + Tailscale + trust fence + optional autostart)
- [x] Mobile web adaptation (mobile-fit)
- [ ] APK (native Android shell)

## License

[MIT](LICENSE)
