# dsh-remote（安卓原生壳 APK）

> 🌐 **语言**：[English](README.md) · 中文

基于 [deepseek-harness-remote](..) 的**安卓原生壳**：一个轻量 WebView 容器，
加载与手机浏览器完全相同的 Tailscale 地址来承载 dsh Web 界面——因此
mobile-fit 适配层与 dsh 信任围栏原样生效。**不改任何 dsh 源码**（与仓库其余
部分一样是纯叠加层）。

**状态**：✅ M1–M3 完成——最小可用壳（M1）；经 mobile-fit ⚙ 齿轮 + `DshShell`
桥的原生设置、深色模式跟随、VPN 横幅实时更新（M2）；release 签名、文档与仓库
路线图（M3）。debug 与 release 安装包开箱可构建；真机验证清单见 `docs/apk.zh-CN.md`。

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

Release 构建（用 `keystore.properties` 签名，见下）：

```powershell
.\gradlew.bat assembleRelease
adb install -r app\build\outputs\apk\release\app-release.apk
```

> debug 与 release 签名不同——**不要互相覆盖安装**；切换时先卸载。

### Release 签名

`apk/keystore.properties`（gitignored）保存 release 密钥库：

```properties
storeFile=C\:\\Users\\<you>\\.android\\dsh-remote-release.jks
storePassword=...
keyAlias=dsh-remote
keyPassword=...
```

用 JDK `keytool` 一次性生成密钥库（有效期 10 年以上）：

```powershell
keytool -genkeypair -v -keystore "$env:USERPROFILE\.android\dsh-remote-release.jks" `
  -alias dsh-remote -keyalg RSA -keysize 2048 -validity 10950 `
  -dname "CN=DSH Remote, OU=personal, O=personal, C=CN"
```

没有该文件时 release 构建仍会成功但**不签名**（可用 `apksigner sign` 补签）。

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
