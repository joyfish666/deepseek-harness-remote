# deepseek-harness-remote（中文）

> 🌐 **语言**：[English](README.md) · 中文

**在任何设备上，随时随地使用 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)。**
电脑、手机都能用——手机端有专属优化界面，另有原生 Android 应用（APK）。

- ✅ **电脑网页端访问**：本机 `http://127.0.0.1:3080`；远程经 Tailscale 隧道
  `https://<机器名>.<tailnet>.ts.net/`
- ✅ **手机网页端适配（mobile-fit）**：窄屏自动启用移动端布局（抽屉导航、会话操作、
  输入体验、设置面板全屏化等）
- ✅ **APK（安卓原生壳）**：独立应用图标、WebView 容器零依赖，手机免浏览器
- ✅ **手机端配置解锁（remote-config 反代，可选）**：手机端也能改模型/插件配置、
  权限与 API Key

> **重要说明**：本项目**无需修改源 dsh 代码**（纯叠加层）；上游 dsh 源码更新后，
> 本项目会**同步适配**。

## 界面预览

<p align="center">
  <img src="assets/web.jpg" alt="手机网页端" width="260"/>
  &nbsp;&nbsp;
  <img src="assets/apk.jpg" alt="手机 APK" width="260"/>
  <br/>
  <sub>左：手机网页端（mobile-fit）&nbsp;&nbsp;右：手机 APK</sub>
</p>

## 实现原理与项目结构（简述）

**纯叠加层**：不改任何 dsh 源码，只做外围适配，上游更新后同步适配。三个组件：

| 组件 | 一句话原理 |
|---|---|
| **mobile-fit**（`mobile-fit/`） | 通过 dsh 官方 client 插件 seam 注入移动端 CSS 与交互（抽屉、输入、设置全屏化等），窄屏自动生效 |
| **APK 壳**（`apk/`） | 零依赖 WebView 容器：地址 + Token 一屏配置，加载与手机浏览器完全相同的入口 |
| **remote-config 反代**（`scripts/remote-config-proxy.mjs`） | dsh 信任围栏只看 Host 头——反代改写成回环拼写并删 Origin，手机端即可改配置 |

详细原理、工程结构与开发说明见 [docs/development.zh-CN.md](docs/development.zh-CN.md)。

## 快速开始（从 0 到远程控制）

1. **电脑**安装 Node.js（≥22），确认 `npx @deepseek-ai/dsh web` 可启动；
2. **启动** dsh web（手动启动或开机自启，二选一）；
3. **手机远程访问**（可选）：Tailscale 组网 → `tailscale serve` → 配置 `trustedHosts`；
4. **手机适配**（可选）：挂载 mobile-fit 插件；
5. **APK 与配置解锁**（可选）：安装 APK；需要手机端改配置时部署 remote-config 反代。

每一步都有完整命令、两种启动方式的选择、Token 开关与**彻底卸载**步骤——
**完整教程请看 [docs/tutorial.zh-CN.md](docs/tutorial.zh-CN.md)**。

## 文档导航

| 文档 | 读者 | 内容 |
|---|---|---|
| [docs/tutorial.zh-CN.md](docs/tutorial.zh-CN.md) · [English](docs/tutorial.md) | **所有用户** | 从 0 完成远程控制：网页端 + APK 两种方式、手动启动/开机自启、Token 开关、彻底卸载、常见问题 |
| [docs/pitfalls.zh-CN.md](docs/pitfalls.zh-CN.md) · [English](docs/pitfalls.md) | **开发者** | 踩坑记录：所有已知坑的根源与对策 |
| [docs/development.zh-CN.md](docs/development.zh-CN.md) · [English](docs/development.md) | **开发者** | 项目结构、mobile-fit / APK / 反代各组件的原理与开发说明、测试、贡献指南 |

## 安全说明

- 仅同一 tailnet 内的设备可访问（Tailscale 设备身份 = 认证）；
- dsh `/api` 信任围栏（trustedHosts）防 DNS rebinding；
- 配置/凭据等特权接口默认钉在本机回环（上游安全设计）；部署 remote-config 反代
  可在手机端解锁（自担风险，见 tutorial 第 4 节）；
- **禁止** `tailscale funnel`（会把服务暴露到公网）。

## 贡献指南

欢迎任何形式的贡献！无论是提出问题（[issues](https://github.com/joyfish666/deepseek-harness-remote/issues)）
还是提交代码（[pull requests](https://github.com/joyfish666/deepseek-harness-remote/pulls)），
即使是再小的毛病、再小的改动，我们都非常欢迎。

开始开发之前，请先阅读：

- [docs/pitfalls.zh-CN.md](docs/pitfalls.zh-CN.md) —— 所有已知坑的根源与对策；
- [docs/development.zh-CN.md](docs/development.zh-CN.md) —— 项目结构与各组件原理。

仓库规矩：**每踩一个新坑，立刻追加记录到 pitfalls**；文档保持中英双语；
脚本若交付 Windows PowerShell 5.1 需纯 ASCII（见 pitfalls P1）。

## 许可证

[MIT](LICENSE)
