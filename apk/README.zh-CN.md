# dsh-remote（安卓原生壳 APK）

> 🌐 **语言**：[English](README.md) · 中文

基于 [deepseek-harness-remote](..) 的**安卓原生壳**：一个轻量 WebView 容器，
加载与手机浏览器完全相同的 Tailscale 地址来承载 dsh Web 界面——因此
mobile-fit 适配层与 dsh 信任围栏原样生效。**不改任何 dsh 源码**（与仓库其余
部分一样是纯叠加层）。

**状态**：🚧 M1（最小可用壳）——可构建 debug APK；首次运行地址设置、Tailscale
引导、返回键导航、外链跳系统浏览器、文件上传桥、下载管理、带重试的错误页。

## 是什么 / 不是什么

- ✅ WebView 壳：独立应用图标、无浏览器干扰、固定地址、Tailscale 连接引导、
  文件选择/下载桥接。
- ✅ 壳内 mobile-fit 全部生效：窄视口自动触发 ≤820px 移动端布局（抽屉、
  Enter 换行、设置全屏化等）。
- ❌ 不是 TWA：Tailscale 的 `*.ts.net` 域名无法托管 TWA 校验所需的
  `assetlinks.json`，且 dsh 前端未注册 service worker。
- ❌ 不绕过 dsh 安全设计：配置/凭据类页面（模型、插件、权限、Agent 预设）
  仅限电脑本机回环访问（远程 403）。
- ❌ 手机必须保持 **Tailscale App 已连接**（VPN）才能到达电脑；壳只负责
  检测 VPN 缺失并引导用户。

## 环境要求

- JDK 17+（21 已验证）与 Android SDK：`platform-tools`、`platforms;android-35`、
  `build-tools;34.0.0`（或 35.0.0）。通过 `apk/local.properties`
  （`sdk.dir=C\:\\...\\Android\\Sdk`）或 `ANDROID_HOME` 指向 SDK。
- 一台安卓手机（Android 8.0+/API 26+），开启 USB 调试以便 `adb install`。

## 构建与安装

```powershell
cd apk
.\gradlew.bat assembleDebug          # 首次运行会下载 Gradle 与 AGP 依赖
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

debug 构建已开启 WebView 远程调试：手机 USB 连接后，在电脑 Chrome 打开
`chrome://inspect` 即可调试壳内页面。

## 首次使用

1. 打开应用 → 输入运行 dsh 的电脑的 Tailscale 地址
   （`https://<机器名>.<tailnet>.ts.net/`，可不带协议头）→ 连接。
2. 若手机 Tailscale VPN 未连接，顶部出现横幅，可一键打开 Tailscale App。
3. 界面与手机浏览器完全一致；用 mobile-fit 验证清单核对
   （`docs/tutorial.zh-CN.md` 第 6 节）。

## 工程结构

```
apk/
  settings.gradle.kts / build.gradle.kts / gradle.properties
  app/
    build.gradle.kts                 # dev.dsh.remote, minSdk 26, targetSdk 35
    src/main/
      AndroidManifest.xml
      java/dev/dsh/remote/MainActivity.java   # 整个壳（零第三方依赖）
      res/                           # 字符串（中/英）、主题（亮/暗）、自适应图标
```

零第三方依赖：纯 `android.app.Activity` + `WebView`、`SharedPreferences`
保存地址、平台 `DownloadManager`。Gradle wrapper 随仓库分发，外部只依赖 SDK。

## 已知限制

- 配置/凭据类页面远程 403（上游设计）；壳内错误页与界面自带的横幅会说明。
- 修改地址目前需清除应用数据（M2 提供应用内设置页）；清除数据也会清掉
  mobile-fit 的内测声明确认（会再提示一次）。
- WebView 行为跟随设备的 System WebView 更新通道；过老的 WebView 可能缺少
  mobile-fit 使用的 `:has()`（Chrome 105+ 才支持）。

## 许可证

MIT（本仓库）。
