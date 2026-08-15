# 项目结构与开发指南（development）

> 🌐 **语言**：[English](development.md) · 中文

> **读者**：开发者 / 维护者。本文介绍仓库结构、三个组件（mobile-fit / APK /
> remote-config 反代）的原理与开发说明、测试方法与贡献指南。
> 仅使用功能的用户请看 [tutorial.zh-CN.md](tutorial.zh-CN.md)；踩坑记录见
> [pitfalls.zh-CN.md](pitfalls.zh-CN.md)。

## 1. 仓库结构总览

```
deepseek-harness-remote/
├── README.md / README.zh-CN.md        # 项目简介 + 截图 + 快速开始（指向 tutorial）
├── docs/
│   ├── tutorial.zh-CN.md / tutorial.md      # 所有用户：从 0 到远程控制（web + APK）
│   ├── pitfalls.zh-CN.md / pitfalls.md      # 开发者：踩坑记录（P1–P34）
│   └── development.zh-CN.md / development.md # 本文档
├── mobile-fit/                        # dsh Web 移动端适配插件（client 插件包）
│   ├── lib/client.js                  # 手写 client bundle（无构建链）
│   ├── lib/index.js                   # node 侧空实现
│   └── test/                          # 形状/交互/聚焦/反代协作测试
├── apk/                               # 安卓原生壳（零第三方依赖 Java）
│   ├── app/src/main/java/dev/dsh/remote/MainActivity.java  # 整个壳
│   ├── app/src/main/res/              # 字符串（中/英）、主题（浅色）、图标
│   └── build.gradle.kts               # minSdk 26 / targetSdk 35 / release 签名
├── scripts/
│   ├── start-dsh.ps1 / .vbs           # dsh web 看门狗 + 零窗口启动
│   ├── remote-config-proxy.mjs        # 反代本体（零依赖）
│   ├── start-remote-config-proxy.ps1 / .vbs
│   ├── test-remote-config-proxy.mjs   # 反代冒烟测试（23 断言）
│   ├── measure-latency.mjs            # 直连 vs 反代逐环节时延测量
│   └── install-apk.ps1                # APK 一键安装
├── assets/                            # README 截图
└── deepseek-harness-master/           # 上游 dsh 源码参考（gitignored，不提交）
```

**核心原则**：纯叠加层，不改任何 dsh 源码；上游更新后同步适配；零依赖优先。

## 2. mobile-fit（手机网页适配插件）

### 原理

通过 dsh 官方 client 插件 seam（`dsh.client` 声明 + `exports["./client"]`）注入
移动端 CSS 与少量交互。client bundle 是手写的
`window.__ModuleLoader__.load({id, factory})` 经典模块（官方同款格式），
不需要 tsdown 构建链；改代码刷新页面即生效（bundle rev 由 client-modules
每次请求重新哈希）。

### 能力

- 侧栏抽屉（☰ → 展开的侧边栏内容，×/遮罩关闭，加载时预展开零闪烁）；
- 会话操作（44px 触控行高、⋯ 菜单常驻、弹窗全屏）；
- 输入体验（Enter 换行、16px 防缩放、**切换会话不自动弹键盘**）；
- 设置面板全屏化；
- 内测声明 localStorage 持久化；
- 原生壳集成（`window.DshShell` 桥 → ⚙ 齿轮打开 APK 原生设置）；
- 反代协作（`window.__DSH_PROXY__` 时 apply 翻转 `connection.isLoopback`）。

### 自定义

编辑 `lib/client.js`，分几块：

- `css` 字符串：移动端规则（媒体查询内；多类名元素用子串匹配，见 pitfalls P14）；
- 抽屉交互：汉堡按钮/遮罩/`openDrawer`/`closeDrawer`；
- 启动调整：预展开侧栏（幂等）、声明持久化、Enter 换行；
- 监听器：MutationObserver、点击捕获、composer 聚焦拦截（pointerdown + focusin）；
- apply 补丁：反代部署下翻转 `connection.isLoopback`
  （配合 `exports.inject = ['connection']` 与反代的 manifest 重排保证时序）。

### 测试

```sh
node mobile-fit/test/bundle-shape.mjs     # 插件形状（apply + inject 导出）
node mobile-fit/test/focus-suppress.mjs   # 聚焦拦截 8 场景
node mobile-fit/test/shell-gear.mjs       # DshShell 齿轮
node mobile-fit/test/proxy-apply.mjs      # 反代 loopback 翻转
```

### 已知说明

- 选择器用官方语义类后缀（`[class$="_sidebarCol"]` 等）与 `data-slot` 槽名，
  构建哈希前缀随版本变化——**上游 dsh 升级后需回归检查**；
- 手机端默认隐藏右侧详情列（`_detailsCol`）；
- 普通浏览器（无反代、无 APK 桥）下这些增强全部自动隐身。

## 3. APK（安卓原生壳）

### 工程结构

```
apk/app/src/main/
├── AndroidManifest.xml              # INTERNET/网络状态权限；adjustResize；edge-to-edge 退出
├── java/dev/dsh/remote/MainActivity.java  # 整个壳（零第三方依赖）
└── res/                             # 字符串（中/英）、浅色主题、自适应图标
```

MainActivity 要点：WebView 容器（JS/DOM storage/cookies）、地址 + Token
一屏配置（Token 预置 cookie 免登录页）、Tailscale VPN 横幅（NetworkCallback
实时）、文件上传/下载桥、错误重试页、`DshShell` JS 桥、保持常亮、深色跟随
（网页内容）等。

### 构建与安装

```powershell
cd apk
.\gradlew.bat assembleDebug          # 首次会下载 Gradle 与 AGP 依赖
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

或一键脚本：`powershell -File scripts\install-apk.ps1 -Type debug`。

**Release 签名**：`apk/keystore.properties`（gitignored）保存密钥库信息
（`storeFile` 绝对路径 + 密码）；用 JDK `keytool` 生成：
`keytool -genkeypair -v -keystore <path>.jks -alias dsh-remote -keyalg RSA -keysize 2048 -validity 10950`。
没有该文件时 release 构建成功但不签名。

> debug 与 release 签名不同——不要互相覆盖安装。

### 已知限制

- 配置/凭据类页面默认远程 403（上游设计）；部署反代后解锁；
- 手机必须保持 Tailscale 连接；
- "清除缓存与站点数据"会清掉内测声明确认（会再提示一次）；
- 应用外壳为浅色风格；网页内容深浅色跟随 dsh 页面自身设置。

## 4. remote-config 反代（远程配置解锁）

### 原理（源码依据）

dsh 的信任围栏（`packages/client/connection/src/api-request-trust.ts`、
`rpc-host.ts`）**只看 Host 头字符串**（回环拼写或 `trustedHosts` 条目）且拒绝
"存在但不匹配的 Origin"。反代把 Host 改写成 `127.0.0.1:<目标端口>` 并删除
Origin 后，普通 `/api`、特权方法（settings/credentials/llm.discoverModels 等，
`PRIVILEGED_METHODS`）与 WebSocket 升级三条路径全部放行。

### 第二层：客户端回环判定

服务端围栏解开后，插件配置卡片仍不可见——dsh 前端还有**客户端**回环判定
（`connection.isLoopback` 取自 `location.hostname`，见
`packages/client/connection/src/client/index.ts`），非回环时
`settingsScope.bind()` 落入 memory 模式不发任何 RPC
（`packages/client/ui-settings/src/client/settings-scope.ts`）。修复 = 反代 +
mobile-fit 协作：

1. 反代在入口 HTML 注入 `window.__DSH_PROXY__ = true`；
2. 反代重排 `__DSH_BOOT__` manifest：mobile-fit 行移到
   `@deepseek-ai/dsh-client-connection` 之后并补 inject 边（保证其 apply 先于
   settings 消费者）；
3. mobile-fit 导出 `inject: ['connection']`，apply 时翻转 `isLoopback`。

**上游升级需回归**：manifest 行 id 与连接插件 id 是修补点。

### HTML 改写

入口 HTML（text/html 且无 content-encoding 时）缓冲改写：注入代理标记 +
重排 manifest（幂等，parse→改→stringify）。

### Token 机制

`DSH_PROXY_TOKEN` 设置后：`/login` 迷你登录页（dsh 设计风格，明暗自适应）下发
`HttpOnly; SameSite=None; Secure` cookie（有效期 1 年）；所有请求（含 WS 升级）
必须携带。**SameSite=None+Secure 是必须的**：Chromium 不随 WS 握手发送 Lax
cookie（pitfalls P35）。

### Bundle 缓存

带 `?rev=` 的 bundle 响应改写为 `Cache-Control: public, max-age=31536000,
immutable`——上游是 `no-cache` 且无 ETag，慢链路每次全量重下；rev 是内容
哈希，缓存语义安全。

### 诊断工具

`DSH_PROXY_DIAG=1` 重启后页面注入"复制诊断日志"按钮（导航时序/慢资源/WS
打开延迟/首个会话行时间），去掉该变量重启即关闭。

### 安全边界

- 反代**只绑定 loopback**；tailnet 身份是认证，token 是第二道防线；
- **禁止** `tailscale funnel`；
- 该反代把"电脑前"的权限延伸到 tailnet——等价于手机就在电脑前，自担风险。

### 测试

```sh
node scripts/test-remote-config-proxy.mjs   # 冒烟：Host 改写/Origin 删除/token 流程/WS 中继/HTML 改写（23 断言）
node scripts/measure-latency.mjs            # 直连 vs 反代逐环节时延（反代零额外延迟）
```

## 5. 测试与真机验证

- **单元/冒烟**：见上文各组件小节；
- **真机**：`adb` 安装 APK 后按 tutorial 的验证清单逐项过（网页端清单 + 壳层项）；
- **调试**：debug 构建开启 WebView 远程调试——手机 USB 连接后
  `chrome://inspect` 可调试壳内页面；
- **回归**：上游 dsh 升级后重点回归 mobile-fit 选择器、manifest 重排、反代改写。

## 6. 贡献指南

欢迎任何形式的贡献！无论提出问题（issues）还是提交代码（pull requests），
即使再小的毛病、再小的改动都非常欢迎。

开始开发之前请先阅读：

- [pitfalls.zh-CN.md](pitfalls.zh-CN.md) —— 所有已知坑的根源与对策；
- 本文档 —— 项目结构与各组件原理；
- 仓库规矩：**每踩一个新坑，立刻追加记录到 pitfalls**；文档保持中英双语；
  脚本若交付 Windows PowerShell 5.1 需纯 ASCII（见 pitfalls P1）。
