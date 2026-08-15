# deepseek-harness-remote（中文）

> 🌐 **语言**：[English](../README.md) · 中文

**在任何设备上，随时随地使用 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)。**
电脑、手机都能用 —— 在家、在外都能远程操控你的 AI 智能体；手机端有专属优化界面，
另有原生 Android 应用（APK，见 [docs/apk.zh-CN.md](docs/apk.zh-CN.md)）。

- ✅ **电脑网页端访问**：本机 `http://127.0.0.1:3080`；远程经 Tailscale 隧道
  `https://<机器名>.<tailnet>.ts.net/`
- ✅ **手机网页端适配（mobile-fit）**：同一入口，窄屏自动启用移动端布局（抽屉导航、
  会话操作、输入体验、设置面板全屏化等）
- ✅ **APK（安卓原生壳）**：`apk/` 目录，WebView 容器零依赖（使用说明见
  [docs/apk.zh-CN.md](docs/apk.zh-CN.md)，开发文档见 [apk/README.zh-CN.md](apk/README.zh-CN.md)）
- ✅ **手机端配置解锁（remote-config 反代，可选）**：手机浏览器与 APK 都能
  改模型/插件配置、权限与 API Key（部署见 [docs/remote-config.zh-CN.md](docs/remote-config.zh-CN.md)）

> **重要说明**：本项目**无需修改源 dsh 代码**（纯叠加层）；上游 dsh 源码更新后，
> 本项目会**同步适配**。

## 界面预览

<!-- 把截图放进 assets/ 目录后，把下面两行取消注释并改成实际文件名：
![电脑网页端](assets/web-desktop.png)
![手机 APK](assets/apk-mobile.png)
-->

## 如何开启远程控制（概览）

1. 安装 Node.js，确认 `npx @deepseek-ai/dsh web` 可启动；
2. 启动 dsh web，本机浏览器打开 `http://127.0.0.1:3080` 验证；
3. （手机远程访问，可选）Tailscale 组网 → `tailscale serve --bg 3080` →
   配置 `trustedHosts`；
4. （手机适配，可选）挂载 mobile-fit 插件。

**详细步骤（从 0 到可用，含卸载还原）请看 [docs/tutorial.zh-CN.md](docs/tutorial.zh-CN.md)。**

## 文档导航

| 文档 | 读者 | 内容 |
|---|---|---|
| [docs/tutorial.zh-CN.md](docs/tutorial.zh-CN.md) · [English](../docs/tutorial.md) | **所有用户** | 从零部署到手机可用的完整教程；含手动启动与开机自启两种方式、彻底卸载还原 |
| [docs/apk.zh-CN.md](docs/apk.zh-CN.md) · [English](../docs/apk.md) | **所有用户** | APK 安装与使用说明（首次运行、日常操作、已知限制） |
| [docs/remote-config.zh-CN.md](docs/remote-config.zh-CN.md) · [English](../docs/remote-config.md) | **所有用户** | 手机端改配置（反代）：原理、部署、token 开关、安全边界 |
| [docs/pitfalls.zh-CN.md](docs/pitfalls.zh-CN.md) · [English](../docs/pitfalls.md) | **开发者 / 维护者**（仅使用的用户可跳过） | 踩坑记录：所有已知坑的根源与对策 |
| [mobile-fit/README.zh-CN.md](mobile-fit/README.zh-CN.md) · [English](../mobile-fit/README.md) | **开发者** | mobile-fit 插件包：原理、安装、自定义、已知说明 |
| [apk/README.zh-CN.md](apk/README.zh-CN.md) · [English](../apk/README.md) | **开发者** | APK 壳：构建、安装、调试、工程结构 |

## 安全说明

- 仅同一 tailnet 内的设备可访问（Tailscale 设备身份 = 认证）；
- dsh `/api` 信任围栏（trustedHosts）防 DNS rebinding；
- 配置/凭据等特权接口被 dsh 钉在本机回环，远程无法调用（上游安全设计）；
  若需手机端改配置，可自担风险部署 remote-config 反代（见
  [docs/remote-config.zh-CN.md](docs/remote-config.zh-CN.md)）；
- **禁止** `tailscale funnel`（会把服务暴露到公网）。

## 常见问题

| 现象 | 处理 |
|---|---|
| 手机打不开域名 | 检查手机 Tailscale App 已连接（VPN 图标）；确认与电脑同一账号 |
| 想用 IP 访问 | 不支持，请用域名 |
| 重启电脑后手机连不上 | 确认 Tailscale 随系统启动、`tailscale serve status` 显示运行中 |
| 页面能开但某些功能报 403 | 配置/凭据类页面（模型、插件配置、权限等）远程访问必然 403，属 dsh 上游安全设计，请在运行 dsh 的电脑上打开 `http://127.0.0.1:<端口>`；若基础功能也 403，则是 `trustedHosts` 未生效（见教程第 2 节）。想在手机端改配置？部署 remote-config 反代（见 [docs/remote-config.zh-CN.md](docs/remote-config.zh-CN.md)） |
| 内测声明每次刷新都弹出 | 点一次"继续"后不再弹出（mobile-fit 已本地持久化）；上游更新声明版本时会再提示一次，属正常 |
| 页面显示 "Failed to load plugins" | mobile-fit 未生效：确认 junction 与 patch 行正确后重启 dsh（见教程第 3 节） |
| 命令行找不到 `tailscale` | Windows 用完整路径：`C:\Program Files\Tailscale\tailscale.exe` |
| 开机看到一个 cmd.exe 窗口 | 是 AMD 显卡驱动（`AMDRSServ.exe`），与项目无关，可关闭 |

## 路线图

- [x] 电脑网页端访问（部署 + Tailscale + 信任围栏 + 可选自启）
- [x] 手机网页端适配（mobile-fit）
- [x] APK（安卓原生壳，`apk/`，使用说明见 docs/apk.zh-CN.md）

## 贡献指南

欢迎任何形式的贡献！无论是提出问题（[issues](https://github.com/joyfish666/deepseek-harness-remote/issues)）
还是提交代码（[pull requests](https://github.com/joyfish666/deepseek-harness-remote/pulls)），
即使是再小的毛病、再小的改动，我们都非常欢迎。

开始开发之前，请先阅读相关文档，避免重复踩坑：

- [docs/pitfalls.zh-CN.md](docs/pitfalls.zh-CN.md) —— 所有已知坑的根源与对策
- [docs/tutorial.zh-CN.md](docs/tutorial.zh-CN.md) —— 项目如何部署与适配
- [mobile-fit/README.zh-CN.md](mobile-fit/README.zh-CN.md) —— mobile-fit 插件的工作原理

## 许可证

[MIT](LICENSE)
