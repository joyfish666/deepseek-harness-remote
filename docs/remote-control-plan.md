# 远程控制 DeepSeek Harness 方案

> 目标：在本机运行 `dsh web` 的前提下，让其他设备（手机、平板、其他电脑）通过网络**远程控制正在运行的实例**——远程启动任务、查看运行状态、管理会话、处理审批。
> 状态：方案设计（未实施）。上游代码 `deepseek-harness-master/` 仅作参考，**不修改、不上传**。

---

## 1. 调研结论（基于上游源码与文档）

| 事实 | 出处 | 含义 |
|---|---|---|
| `dsh web` 默认只绑定 `127.0.0.1:3080` | 根 README、`packages/bundle/web-app/README.md` | 默认仅本机可访问 |
| `--host 0.0.0.0` 被 CLI **主动拒绝** | `packages/bundle/web-app/src/startup.ts`（`--host 0.0.0.0 is intentionally not supported yet for safety: it would expose remote code execution to the network`） | 官方**故意**禁止全接口绑定，直到有认证层 |
| `/api` 有信任围栏（trust fence） | `packages/client/connection/src/api-request-trust.ts` | Host 必须是 loopback 或在 `trustedHosts` 中；校验 Origin / `sec-fetch-site`（防 DNS rebinding / CSRF） |
| 围栏**不是认证** | `packages/client/connection/README.md`：*"The fence is a reachability policy, not authentication; the Web carrier provides no authentication layer"* | 只要能到达端口，即可控制；dsh 本身就是远程代码执行（Bash、文件系统、终端） |
| 已有 LAN 预留机制 | `trustedHosts` 配置 + CLI `--trusted-host`；`resolveLanTrust()` 可从 `0.0.0.0` 推导 LAN IP | 上游为"未来远程访问"预留了信任声明机制 |
| 特权方法仅限 loopback | `PRIVILEGED_METHODS`：`host.pickDirectory` / `host.openPath` / settings / credentials / agentPreset 管理域 | 即使开放 LAN，配置与密钥读写仍被钉在本机 |
| Web 协议 = HTTP POST 一元 RPC + 两个下行 WebSocket | `packages/client/connection`：`/api/*`（Typert Remote，如 `session.list`、`goals.create`）+ `/api/events.mux`、`/api/events.host` | 存在一条**完整可编程的控制通道**，浏览器就是它的客户端 |
| SDK / ACP 均走 stdio | `packages/sdk/*`、`packages/acp/*`（JSON-RPC over stdio） | 只能驱动**新起的子进程**，不能控制正在运行的 web 实例 |
| 一切皆插件（Cordis） | `docs/architecture.md`；profile 可叠加 `cordis.patch.yml` | 可以不改上游源码，用**外部插件**扩展运行中的实例 |
| Web GUI 已是完整控制面 | `docs/user/guide/index.md` | 会话、任务、状态、审批、设置均已具备 |
| 上游为 developer preview，快速演进、兼容性会破坏 | 根 README | fork 打补丁的维护成本高，优先"不改上游"的路线 |

**核心结论：**
1. 官方尚未提供"带认证的远程访问"，但已经为它预留了全部机制（trustedHosts、插件架构、可编程 /api 通道）。
2. dsh = 远程代码执行，**任何远程方案都必须有认证 + 加密**，且认证不能依赖上游（上游明确没有认证层）。
3. 本机处于 NAT 环境（连 GitHub 都需代理），入站不可达 → 必须用**出站隧道**或**有公网地址的中转**。

---

## 2. 方案对比

| 方案 | 做法 | 改动量 | 控制"正在运行的实例" | 安全性 | 工作量 |
|---|---|---|---|---|---|
| **A. 隧道 + 现有 GUI** | 用 SSH 反向隧道 / frp / Cloudflare Tunnel / Tailscale 把远端端口映射到本机 `127.0.0.1:3080`，配合 `trustedHosts` 与隧道层认证 | 零代码 | ✅ 完整 GUI（任务/状态/会话/审批） | 依赖隧道层认证（必须配置） | ★ 极小 |
| B. fork 上游允许 `0.0.0.0` | 改 `startup.ts` 放开全接口绑定 + 填 `trustedHosts` | 小 | ✅ | ❌ 无认证，LAN 内任何人可 RCE；上游演进导致补丁漂移 | ★ 小（但不推荐单独用） |
| **C. 自建远程网关** | 在 `deepseek-harness-remote` 中写独立网关服务：本机侧作为 `/api` 客户端连 dsh；对外提供 HTTPS + Token 的 REST/WS API 与移动端 UI | 全部自有代码 | ✅（走 /api 协议与事件流） | ✅ 认证/TLS/限流/审计完全自控 | ★★★ 大（推荐主体） |
| D. dsh 外部插件 | 利用 Cordis 插件机制挂载自定义 bundle（profile patch），同进程内用 `ctx.agents`/`ctx.sessions`/`ctx.commands` 等暴露控制 API | 自有插件包 | ✅ 能力最全（同进程） | ✅ 可控 | ★★★ 大（进阶） |
| E. SDK/ACP 包装 | 网关 spawn 独立 headless dsh（jsonrpc）跑远程任务 | 中 | ❌ 不能控制已运行的 web 实例 | ✅ 可控 | ★★ 中（仅适合"另起任务"场景） |

---

## 3. 推荐架构（分阶段落地）

### Phase 1 —— 隧道 + 现有 GUI（零改动，立即可用）

把已经跑在 `127.0.0.1:3080` 的 Web UI 安全地送到其他设备：

1. **网络通道**（按环境选一，均需保持 3080 只在本机监听）：
   - **Tailscale（推荐首选）**：身份认证（设备授权）+ WireGuard 加密 + 固定内网 IP，手机装 App 即用，无需公网 IP；`tailscale serve` 或 `ssh -L` 转发到 3080。
   - **frp + 轻量 VPS**：本机 frpc 出站连 VPS frps，远端通过 `vps:端口` 访问；frp 端加 token，VPS 前置 Caddy/Nginx 加 BasicAuth 或客户端证书。
   - **Cloudflare Tunnel**：本机 `cloudflared` 出站建隧道；域名 Host 会变化 → 需要把域名加进 `trustedHosts`；再用 Cloudflare Access 做身份认证。
   - **SSH 反向隧道**：`ssh -R 3080:localhost:3080 user@vps`，远端浏览器访问 `http://localhost:3080`（Host 仍为 loopback，信任围栏直接放行）；依赖 SSH 密钥。
2. **信任围栏配置**（仅当经隧道访问时的 Host 不是 loopback 才需要，如 Cloudflare/自定义域名）：
   ```yaml
   # ~/.dsh/.../cordis.patch.yml（home 级覆盖）
   # web-app 的 client-connection 行加：
   trustedHosts:
     - my-harness.example.com
   ```
   或启动时 `dsh web --trusted-host my-harness.example.com`。
3. **必须同时配置隧道层认证**（BasicAuth / Access / Tailscale 设备授权 / SSH 密钥），否则任何人可达 = 任何人可执行代码。
4. **验收**：手机浏览器打开远端 URL → 登录隧道认证 → 能建会话、发任务、看到实时状态、处理审批。

> 已知限制：桌面 UI 在手机上可用但体验一般；Cloudflare 免费域名每次变化（用固定域名或 Tailscale/frp 规避）。

### Phase 2 —— 自建远程网关（本项目主体，推荐）

在 `deepseek-harness-remote` 中开发独立网关服务，架构如下：

```
其他设备（手机/平板/电脑）
   │  HTTPS + Token（REST/WS，移动端友好 UI）
   ▼
┌──────────────────────────────┐
│  remote-gateway（本项目）      │  ← 认证 / TLS / 限流 / 审计 / 会话代理
│  - 对外: HTTPS + JSON API + WS │
│  - 对内: 以"本地客户端"身份连    │
│         127.0.0.1:3080 的 /api │  ← 从 loopback 连，信任围栏放行
└──────────┬───────────────────┘
           │ HTTP POST 一元 RPC + WS(events.mux / events.host)
           ▼
┌──────────────────────────────┐
│ dsh web（正在运行，保持 127.0.0.1:3080）│
└──────────────────────────────┘
```

要点：
- **对内**：复用浏览器同款协议——`packages/client/connection` 是协议与实现的权威参考；HTTP POST 调用 Typert Remote 方法（`session.*`、`goals.*`、`agentPreset.*` 等），WebSocket 订阅 `events.mux` / `events.host` 下行事件流，获得实时状态推送。
- **对外**：网关只暴露自己定义的**最小 API**（发消息、列会话、看事件流、审批、取消、建目标），不盲目转发全部 `/api`；认证用强随机 Token（或用户名+密码），传输必须 HTTPS（自签证书 + 客户端信任，或经隧道/VPS 终止 TLS）。
- **审批联动**：dsh 的 approval 请求会出现在事件流中，网关把它转成远端设备的"允许/拒绝"按钮；也可以配置 permission presets 自动放行低风险操作（这是策略选择，需用户明确）。
- **审计**：网关记录谁在什么时间做了什么操作（dsh 自身有会话日志，网关补一层访问日志）。
- **移动端**：第一版做一个纯静态单页（可放 `dsh web` 之外独立端口），后续再考虑原生 App。
- **部署**：与 dsh 同机运行；对公网暴露仍建议经 Phase 1 的隧道/VPS（网关保持只监听 loopback，由隧道承载对外入口），或网关直接监听 0.0.0.0 + HTTPS 证书。

### Phase 3 ——（可选）dsh 外部插件

如果网关需要比 `/api` 更全的能力（如订阅全部 `session/event`、操作权限策略、注入上下文），用 Cordis 插件机制做一个**外部插件包**：
- 挂在 profile 的 `cordis.patch.yml`（home 级），不改上游源码；
- 插件内注册自己的 HTTP 路由或复用现有服务（`ctx.agents`、`ctx.sessions`、`ctx.commands`、`ctx.goals`）；
- 需要搭建 `tsdown` 构建链并跟随上游接口演进。

Phase 3 是 Phase 2 的"能力补强"，两者可并存：网关先走 `/api`，遇到缺口再补插件。

---

## 4. 安全清单（所有方案必须满足）

1. **认证**：远程入口必须有身份认证（Token / 隧道身份 / 双因素），绝不裸奔。
2. **加密**：传输层必须 TLS（Tailscale 自带 WireGuard；frp 建议配 TLS；网关必须 HTTPS）。
3. **最小暴露**：dsh 本体保持 `127.0.0.1:3080`；对外只暴露网关的受控 API；特权方法（settings / credentials / host.*）保持 loopback（上游已强制）。
4. **限流与审计**：网关加登录限流、访问日志；异常登录告警。
5. **审批策略**：远程控制下明确 approval policy——哪些操作自动放行、哪些必须人工确认；建议高风险工具（Bash 写操作、文件删除等）保持人工审批。
6. **密钥管理**：Token/证书不进 git（已在 `.gitignore` 排除 `.env`）。
7. **会话边界**：网关与 dsh 之间用专用、最小权限的本地账号运行。

---

## 5. 实施路线图

| 里程碑 | 内容 | 验收标准 |
|---|---|---|
| M1 隧道可用（Phase 1） | 选定隧道（建议 Tailscale），配好认证与 trustedHosts | 手机经隧道完成一次"远程发任务 → 看状态 → 审批" |
| M2 网关骨架 | `remote-gateway/`：连本机 `/api`，实现会话列表 + 发消息 + 事件流订阅 | 网关在局域网内被第二台设备调用成功 |
| M3 移动端 UI | 单页界面：会话列表、消息流、审批按钮、状态展示 | 手机浏览器完整操作一轮 |
| M4 安全加固 | Token 认证、HTTPS、限流、审计日志 | 无 Token 请求被拒；日志可追溯 |
| M5 对外部署 | 经隧道/VPS 暴露，公网设备可用 | 公网手机完成全流程；本机 dsh 无改动 |
| M6（可选）插件补强 | 按 Phase 3 补缺口能力 | 需要的事件/操作全部可达 |

**建议起点**：M1（Tailscale + 现有 GUI）今天就能用；M2–M4 是项目主体开发内容。

---

## 7. M1 实施记录（2026 本机实测）

> 以下为已在本机（Windows）实际执行的步骤与配置，Tailscale 值见本机 `tailscale status`。

### 已完成

1. **Tailscale 组网**：电脑 `desktop-joyfish` 与手机 `redmi-k70e` 已加入同一 tailnet（手机需安装 Tailscale App 并登录同一账号）。
2. **trustedHosts 补丁**（已热重载生效，无需重启 dsh）：写入 `~/.dsh/profiles/web/cordis.patch.yml`：

   ```yaml
   - id: connection
     config:
       trustedHosts: !!js "[<tailnet-ip>, '<machine>.<tailnet>.ts.net', ...ctx.webRuntime.trustedHosts]"
   ```

   - 作用：让 `/api` 信任围栏放行来自 tailnet 的请求（Host 命中 trustedHosts）；未信任 Host 仍返回 403。
   - 验证：`curl -H "Host: <tailnet-ip>" http://127.0.0.1:3080/api/session.list` 由 403 → 404（围栏放行，404 为路径不合法）；未知 Host 仍 403。
   - **格式坑**：`!!js` 标签只接受单个 YAML 标量——整个 JS 表达式必须用引号包裹成字符串；带空格的裸流式数组会导致启动解析失败（fail-loud）。
   - 该文件由 dsh 的 `watchUserPatches`（Cordis HMR）热重载，事务性重应用，改完即时生效。

3. **tailscale serve**：`tailscale serve --bg 3080`（把 `https://<machine>.<tailnet>.ts.net/` 转发到本机 `127.0.0.1:3080`）。注意：**首次使用需 tailnet 管理员在 `https://login.tailscale.com/f/serve?node=<node>` 启用 Serve 功能**（安全开关，一个页面开关）。

### 实测结论（重要）

- **手机/浏览器只能使用 MagicDNS 域名** `https://<machine>.<tailnet>.ts.net/`——本版本 Tailscale Serve 只为域名签发证书（SAN 仅含 DNS 名），且对 `https://<tailnet-ip>/` 的连接直接拒绝（TLS alert internal error，IP 无 SNI 站点）。Windows 的 curl/schannel 对 IP 直连也不支持 SNI，属同一限制。
- 端到端验证（PC 侧，经 tailnet 域名）：静态页 200 ✅；真实 RPC `POST /api/session.list`（信封 `{"type":"client-request","rpcId":"<id>","method":"session.list","payload":{}}`）返回 200 + 会话数据 ✅；WebSocket `wss://…/api/events.mux`（带 `Origin` 头）握手通过并收到 `session/subscribed` 帧 ✅；未知 Host 仍 403 ✅。

### 手机端使用

1. 手机浏览器打开 `https://<machine>.<tailnet>.ts.net/`（Tailscale App 需保持连接；MagicDNS 由 App 自动配置）。
2. 之后即可远程建会话、发任务、看状态、处理审批。

### 安全边界（重要）

- 仅 tailnet 内设备可达（Tailscale 设备身份 = 认证）；`/api` 围栏对 trustedHosts 放行、对其余 Host 拒绝。
- 特权方法（settings / credentials / host.* 等）仍被上游钉在 loopback，远程不可用。
- 不要改用 `tailscale funnel`（会暴露到公网）。
- 若以后机器 IP 变化（Tailscale IP 通常稳定），同步更新补丁里的 IP 即可；MagicDNS 域名不变。

---

## 6. 风险与对策

| 风险 | 对策 |
|---|---|
| 无认证暴露导致远程代码执行 | 安全清单强制项；网关是唯一对外入口 |
| 上游协议/接口快速变化 | 网关只依赖 `/api` 稳定面；跟上游保持同步而非 fork |
| 本机 NAT / 无公网 IP | 全部走**出站隧道**（Tailscale / frp / Cloudflare） |
| 手机端桌面 UI 体验差 | Phase 2 自建移动端 UI |
| 远程审批不可达导致任务卡住 | 审批转远端设备 + 可配置 permission presets |
| trustedHosts 配置错误导致围栏拒绝 | 文档化配置示例；M1 验收即验证 |
