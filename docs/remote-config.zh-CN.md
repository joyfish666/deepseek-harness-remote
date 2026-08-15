# 远程配置（remote-config 反代）

> 🌐 **语言**：[English](remote-config.md) · 中文

> **读者**：想在**手机上改模型/插件配置、权限、API Key** 的所有用户——手机浏览器
> 与 APK 共用同一个入口，只需在 PC 端跑一个可选脚本。

## 一句话原理

dsh 把配置/凭据平面（模型、插件配置、权限、Agent 预设、`llm.discoverModels`）
钉在**本机回环**：信任围栏只看 **Host 头字符串**（源码确认：
`packages/client/connection/src/api-request-trust.ts` 与 `rpc-host.ts`），
从不看来源 IP。一个小型反代把 Host 改写成回环拼写并删除 Origin 头，
远程调用即通过围栏。

```
手机浏览器 / APK WebView
   │  都加载 https://<机器名>.<tailnet>.ts.net/
   ▼
tailscale serve（443 → PC 127.0.0.1:3081）
   ▼
scripts/remote-config-proxy.mjs   （仅 loopback；改写 Host、删除 Origin）
   ▼
dsh web @ 127.0.0.1:3080
```

整个入口同源，普通 API、WebSocket 事件流（`/api/events.mux`、
`/api/events.host`）、页面资源与 mobile-fit 全部照常工作。

## 为什么有效（dsh 源码依据）

- 每个 `/api` 请求都过 `isTrustedApiRequest()`——只查 Host 头
  （`localhost` / `[::1]` / 任意 127.x）外加"Origin 若存在必须与 Host 完全一致"。
- 特权方法额外用**空**信任表再过一次围栏：其 Host 必须是回环拼写。
  反代把 Host 改写成 `127.0.0.1:3080` 即满足。
- Origin 头必须**删除**而不是改写：浏览器对 POST 会带
  `Origin: https://<tailnet域名>`，与回环 Host 不匹配会被 Origin 围栏拒绝。
- WebSocket 升级（`/api/events.mux`、`/api/events.host`）握手走同一围栏；
  反代原样中继 101 并拼接双向 socket。

## 部署

### 1. 先手动启动反代

```powershell
cd <仓库>\scripts
node remote-config-proxy.mjs
```

默认：监听 `127.0.0.1:3081`，转发到 `http://127.0.0.1:3080`。
环境变量：`DSH_PROXY_PORT`、`DSH_PROXY_TARGET`、`DSH_PROXY_TOKEN`
（见下文 Token 开关）。反代**只绑定 loopback**——局域网内其他设备无法直连。

### 2. 把 tailscale serve 指向反代

```powershell
tailscale serve status                          # 先记录当前挂载
tailscale serve --bg 3081                       # 根 / -> 127.0.0.1:3081
tailscale serve status                          # 检查；若 /m 丢失则补回：
tailscale serve --bg --set-path /m http://127.0.0.1:3100
```

### 3. 手机验证

打开 `https://<机器名>.<tailnet>.ts.net/` → 设置 → **模型 / 插件 / 权限 /
API Key 页面现在可加载、可保存**（此前为空白或 403）。

> 反代会把入口页 HTML 改写两处（幂等）：注入 `window.__DSH_PROXY__` 标记、
> 重排 boot manifest（mobile-fit 行移到 connection 行之后并加 inject 边）。
> 两者是插件配置卡片可见性的前提——见下文"为什么插件配置需要第二层修复"。

## Token 开关（建议开启）

围栏明确不是认证层：**能触达反代的人就能改配置。** tailnet 设备身份是唯一
边界——除非设置 token：

```powershell
setx DSH_PROXY_TOKEN <一长串随机字符>     # 持久化，新进程生效
```

设置后，反代在 `/login` 提供迷你登录页；所有请求（含 WebSocket 升级）必须携带
它下发的 HttpOnly cookie（有效期 1 年）。APK 的 WebView 共用同一 cookie，每台
手机登录一次。轮换 token 即可让所有手机失效。

**固定 token 提示**：用固定口令（如 `wang2004`）可以避免自启/换机后重新登录
（cookie 持久 1 年，基本只登录一次）；代价是口令强度低于随机长串——tailnet
设备身份仍是主要边界，token 只是第二道防线。建议至少不与常见弱口令相同。

## 开机自启（可选）

沿用现有零窗口模式（见教程第 4 节）：

```powershell
$action = New-ScheduledTaskAction -Execute 'wscript.exe' `
  -Argument '"<仓库>\scripts\start-remote-config-proxy.vbs"'
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName 'dsh-remote-config-proxy' -Action $action -Trigger $trigger -Settings $settings -Force
```

`start-remote-config-proxy.ps1` 是看门狗（10 秒重启、端口冲突保护、日志在
`~/.dsh/logs/remote-config-proxy.log`）；vbs 包装负责隐藏窗口（P25/P26）。

## 冒烟测试

```powershell
node scripts\test-remote-config-proxy.mjs
```

起一个 mock 目标 + 反代，断言：Host 改写、Origin 删除、cookie 透传、
完整 token 登录流程、WebSocket 101/回显中继（19 条断言）。

## 故障排查

| 现象 | 原因 / 处理 |
|---|---|
| 设置页仍 403 | 反代没跑，或 serve 仍指向 3080——查 `tailscale serve status` 与反代日志 |
| 手机出现没设置过的登录页 | 某处设置了 `DSH_PROXY_TOKEN`；登录或取消该变量 |
| 页面能开但会话不实时更新 | WebSocket 中继被挡——查反代日志的 `upgrade error`，重启反代 |
| 模型目录能开但"发现模型"失败 | 该方法也在回环平面内，反代已覆盖；用冒烟测试路径核对 `settings.describe` |
| 浏览器正常、APK 不行 | 同源/cookie 问题：在 APK 的 WebView 里登录一次（⚙ 齿轮 → 重开，或清数据重载） |

## 为什么插件配置需要第二层修复

服务端围栏解开后，**插件配置卡片**仍不可见——因为 dsh 前端还有一个
**客户端**回环判定：`connection.isLoopback` 由 `location.hostname` 计算
（`packages/client/connection/src/client/index.ts`），经反代后仍是 tailnet
域名 → `settingsScope.bind()` 落入 `memory` 持久化模式
（`packages/client/ui-settings/src/client/settings-scope.ts`），不发任何 RPC。
反代 + mobile-fit 协作修复：

1. 反代在入口 HTML 注入 `window.__DSH_PROXY__ = true`；
2. 反代重排 `__DSH_BOOT__` manifest：mobile-fit 行移到
   `@deepseek-ai/dsh-client-connection` 之后，并补 `inject` 边——保证其 apply
   先于 settings 消费者（ui-settings / ui-settings-plugins 等）执行；
3. mobile-fit 导出 `inject: ['connection']`，apply 时若标记存在则把
   `connection.isLoopback` 翻为 true。

无反代部署完全不受影响（无标记即不改动）。**dsh 上游升级后需回归检查**
manifest 行 id 与连接插件 id 是否变化。

## 安全边界（务必阅读）

- 本反代**有意把电脑本机权限延伸到 tailnet**：等价于"手机就在电脑前"。
- 保持 loopback 监听（**不要**绑到局域网/公网，**禁止** `tailscale funnel`）。
  tailnet 身份是认证，token 是第二道防线。
- dsh 上游把这个平面钉在回环，直到出现真正的认证层——反代属于个人工作流
  特性，不是产品改动；未改任何 dsh 源码（前端配合通过 mobile-fit 叠加层 +
  反代改写实现，upstream 升级需回归）。

## 文件布局

```
scripts/remote-config-proxy.mjs      反代本体（零依赖，约 230 行）
scripts/test-remote-config-proxy.mjs 冒烟测试（19 条断言）
scripts/start-remote-config-proxy.ps1 看门狗启动器
scripts/start-remote-config-proxy.vbs 隐藏窗口包装
docs/remote-config.md                本文档（英文）
```
