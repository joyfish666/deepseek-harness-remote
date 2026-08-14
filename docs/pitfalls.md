# 踩坑记录（Pitfalls）

> **规矩**：修改相关代码前，先读本文件；每踩一个新坑，立刻追加记录。
> **原则**：解决问题必须先找**根源**；修复时要思考**其他场景**是否也存在同类问题；禁止只针对单个症状打补丁。

---

## 一、Windows / PowerShell 环境

| # | 坑 | 根源 | 对策 |
|---|---|---|---|
| P1 | `start-dsh.ps1` 带中文注释在任务计划（Windows PowerShell 5.1）下解析失败 | PS 5.1 把 UTF-8 无 BOM 文件按 ANSI(GBK) 读取，多字节序列吞掉换行 | 交付给 PS 5.1 的脚本保持**纯 ASCII**；或保存为 UTF-8 **带 BOM** |
| P2 | `Out-File -Encoding utf8` 写出的 JSON 被网关拒绝（"body is not JSON"） | PS 5.1 的 `utf8` = 带 BOM，BOM 污染 JSON 首字节 | 测试/脚本里写 JSON 用 `[System.IO.File]::WriteAllText`；或手动剥 BOM |
| P3 | `curl -d "{\"a\":1}"` 在 PowerShell 里引号被剥，服务端收到残缺 JSON | PowerShell 向原生程序传参时的引号转义问题 | 一律 `--data-binary "@文件"` 方式传 JSON 体 |
| P4 | `Set-Content -NoNewline` 把数组元素连成一行 | `-NoNewline` 不补元素间分隔符 | 用管道 `@(...) \| Set-Content`（默认逐行）；写 `.env` 后必须重新解析验证 |
| P5 | 本机 git push 直连 GitHub 连接被重置 | 网络环境需代理 | 仓库级 `git config http.proxy http://127.0.0.1:7890`（+https.proxy），勿动全局 |

## 二、dsh 配置与热重载

| # | 坑 | 根源 | 对策 |
|---|---|---|---|
| P6 | `!!js` 补丁表达式写成带空格数组 → dsh 启动 fail-loud 解析失败 | dsh 的 `!!js` 标签 `kind: "scalar"`，只接受**单个 YAML 标量** | 整个 JS 表达式用**双引号包裹成字符串**：`trustedHosts: !!js "[...数组...]"` |
| P7 | 改 `~/.dsh/profiles/web/cordis.patch.yml` 后以为要重启 | profile 补丁由 `watchUserPatches`（Cordis HMR）**热重载** | 改完等几秒即生效；但**格式错误会 fail-loud**——修改前先备份 |
| P8 | `host.listDirectory` 返回 "needs the browse capability" | 目录选择是 seam：native 后端不提供 browse 方法；本机默认解析为 native | 补丁禁用 `directory-picker`(auto) 并插入 `directory-picker-browse` 行（副作用：桌面端选择工作区也变浏览器内浏览） |
| P9 | 修改 profile 补丁的瞬间，dsh 连接层可能重启 → 已建立的 WebSocket 全断 | HMR 事务性重应用会重建相关插件纤维 | 消费方必须**自动重连**（指数退避）；SSE 写端必须 try/catch 防死客户端传播 |

## 三、dsh 协议（网关/UI 对接）

| # | 坑 | 根源 | 对策 |
|---|---|---|---|
| P10 | 会话历史渲染出 "error undefined / 🔧 undefined" | `SessionEvent` 的载荷在 **`data`** 字段：`data.content`、`data.message.content`、`data.chunk.text`、`data.name`、`data.arguments`、`data.error`，顶层只有 `type/seq/time` | UI 渲染一律读 `ev.data.*`；不要在顶层猜字段 |
| P11 | e2e 里 15 项全部误报 "(hello)" | 网关 SSE 广播封装是 `{kind, frame}`，**frame 才是 dsh 信封**；测试把外层当信封解 | 消费 `data.frame`（或解构 `{frame}`）；协议封装写进契约注释 |
| P12 | `/api/workspaces/archiveSession` 404 | wire 路径 = **完整方法名带点**：`/api/workspace.archiveSession`（`session.list` → `/api/session.list`） | 按 `rpc-map.ts` 的键直接拼路径 |
| P13 | 审批/提问应答方式特殊 | 服务端请求帧（approval/requested）带稳定 rpcId，客户端经 **`POST /api/respond`** 回填该 rpcId（非普通 RPC，不在 RpcMethodMap） | 应答走 `respond(rpcId, {sessionId, approvalId, outcome})`；outcome 仅 `allowed-once/rejected` |
| P14 | `session.prompt` 内容以 `/` 开头=斜杠命令，不消耗模型 | 官方语义 | UI 提示"（/ 开头为命令）"，不用特殊处理 |
| P15 | Node 内置 WebSocket 客户端可直连 dsh（零依赖成立） | Node ≥22 全局 WebSocket 稳定 | 网关无需 `ws` 包；手机侧用 SSE（EventSource 自带重连）替代 WS 服务端 |
| P16 | SSE 空闲连接可能被中间层掐断 | 代理/网关的空闲超时 | 每 25s 发 `: ping` 注释帧心跳 |

## 四、UI / 前端

| # | 坑 | 根源 | 对策 |
|---|---|---|---|
| P17 | 挂载在 `/m/` 子路径时绝对路径全失效 | tailscale serve 以路径前缀转发，`/api` 会落到根挂载 | 全部用**相对路径**（`fetch('api/...')`）+ index.html 内联脚本**无尾斜杠自动跳转**（serve 对 `/m` 返回 200 而非重定向） |
| P18 | 打开大会话 → 页面空白后"无响应"卡死 | **同步渲染**：历史动辄数千事件逐个建 DOM；`textContent +=` 逐块拼接 O(n²)；每事件强制 `scrollTop` 触发布局 | 见 P19-P21 三条对策 |
| P19 | 流式块文本 `textContent +=` O(n²) | 每 chunk 重写整个文本节点 | 累积到 `node._parts[]`，**限频 flush**（80ms）一次 `join('')` 写入；完成时立即刷 |
| P20 | 历史一次性渲染阻塞主线程 | 无分帧 | **分批渲染**（每批 ~60 条 + `setInterval(0)` 让出主线程），渲染前显示"加载中…"占位 |
| P21 | 每事件 `scrollTop = scrollHeight` 强制同步布局 | 布局抖动 | 去掉逐事件滚动；改为**节流滚动**（rAF 合并），历史渲染完再滚到底 |
| P22 | 旧令牌残留 → 登录界面永不出现 | 启动时只判断"有 token"就直接进入，未校验有效性 | **启动先校验**（health），401 即清令牌回未连接态；任何 API 401 同样处理 |

## 五、测试与验收

| # | 坑 | 根源 | 对策 |
|---|---|---|---|
| P23 | e2e 测试会话污染会话列表 | 测试创建了真实会话 | 验收后调用 `workspace.archiveSession` 归档（幂等）；测试会话标题统一 `[E2E] 前缀`便于识别 |
| P24 | e2e 断言过严（要求小任务必须调工具） | 简单 prompt 本就不调工具 | 工具调用改**信息性输出**，不断言 |

## 六、部署 / Tailscale

| # | 坑 | 根源 | 对策 |
|---|---|---|---|
| P25 | `tailscale serve` 首次使用报 "Serve is not enabled on your tailnet" | Tailscale 安全开关，需网页授权一次 | 用终端给的 `https://login.tailscale.com/f/serve?node=…` 链接 Enable |
| P26 | `https://<tailnet-ip>/` 打不开（TLS alert / schannel 不支持 IP SNI） | 本版 Serve 只为 **MagicDNS 域名**签证书；Windows schannel 对 IP 不发 SNI | 一律用 `https://<机器名>.<tailnet>.ts.net/`；测试用 Node/curl 而非 schannel |
| P27 | 自启任务必须防双实例 | 登录时用户可能已手动启动 | 自启脚本先查端口占用（`Get-NetTCPConnection -LocalPort`）再启动 |
| P28 | 手机键盘 Enter 会"发送"，用户期望换行 | 桌面习惯（Enter 发送）与手机输入法冲突 | 移动端 UI 里 Enter 一律换行，发送只走按钮（设计决策，非 bug） |
| P29 | remote 方法（goals 等）报 "must contain exactly one plain-object args field" / "missing agentId" | Typert wire 载荷固定为 `{args:{...}}` 单键对象；agent 查找身份字段名固定为 **`agentId`**（值=会话 id），业务参数平铺在 args 内 | `dsh.rpc('goals/create', { args: { agentId: sessionId, request: { objective } } })` |
| P30 | `session.search` 报 "search is disabled: openAt never" | web-app bundle 默认 `session-query-sqlite.openAt: never`（全文搜索为 opt-in） | profile 补丁重述整行：`{path: ':memory:', openAt: first-search}`（首次搜索时懒建索引，热重载生效） |
| P31 | `agentPreset.list` 返回结构是 `{presets:[...]}` 而非 `{items}` | 各域 wire 返回结构不同 | 网关层归一化对外契约（`{items}`），UI 不感知差异 |

## 七、方法原则（来自教训）

1. **找根源**：现象 → 复现 → 读协议/源码确认根因 → 修复 → 回归。禁止"看起来对了就完"。
2. **横向排查**：一个场景出问题，检查同字段/同模式是否在其他场景也错（如 P10 的 `data.*` 问题同时影响历史与实时、所有事件类型）。
3. **性能类问题先量化**：先测数据量级（历史事件数、单条消息大小），再决定对策（P18 就是先确认 59k 事件才定位同步渲染）。
4. **零依赖优先**：能用 Node 内置能力就不用 npm 包（P15），部署与维护成本最低。
5. **安全默认关**：认证、限流、审计、目录约束（越界 403）都是默认行为，不是可选项。
