# 踩坑记录（Pitfalls）

> **读者**：本文件面向**开发者 / 维护者**（修改本项目代码前必读）。只想使用本项目的
> 用户无需阅读。
>
> **规矩**：修改相关代码前，先读本文件；每踩一个新坑，立刻追加记录。
> **原则**：解决问题必须先找**根源**；修复时要思考**其他场景**是否也存在同类问题；禁止只针对单个症状打补丁。

---

## 一、Windows / PowerShell 环境

| # | 坑 | 根源 | 对策 |
|---|---|---|---|
| P1 | `start-dsh.ps1` 带中文注释在任务计划（Windows PowerShell 5.1）下解析失败 | PS 5.1 把 UTF-8 无 BOM 文件按 ANSI(GBK) 读取，多字节序列吞掉换行 | 交付给 PS 5.1 的脚本保持**纯 ASCII**；或保存为 UTF-8 **带 BOM** |
| P2 | `Out-File -Encoding utf8` 写出的 JSON 被拒（"body is not JSON"） | PS 5.1 的 `utf8` = 带 BOM，BOM 污染 JSON 首字节 | 测试/脚本里写 JSON 用 `[System.IO.File]::WriteAllText`；或手动剥 BOM |
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
| P10 | `session.search` 报 "search is disabled: openAt never" | web-app bundle 默认 `session-query-sqlite.openAt: never`（全文搜索为 opt-in） | profile 补丁重述整行：`{path: ':memory:', openAt: first-search}`（首次搜索时懒建索引，热重载生效） |

## 三、dsh 协议

| # | 坑 | 根源 | 对策 |
|---|---|---|---|
| P11 | 会话历史渲染出 "error undefined / 🔧 undefined" | `SessionEvent` 的载荷在 **`data`** 字段：`data.content`、`data.message.content`、`data.chunk.text`、`data.name`、`data.arguments`、`data.error`，顶层只有 `type/seq/time` | 读取 dsh 事件一律读 `ev.data.*`；不要在顶层猜字段 |
| P12 | `/api/workspaces/archiveSession` 404 | wire 路径 = **完整方法名带点**：`/api/workspace.archiveSession`（`session.list` → `/api/session.list`） | 按方法名直接拼路径 |
| P13 | `session.prompt` 内容以 `/` 开头=斜杠命令，不消耗模型 | 官方语义 | UI 提示"（/ 开头为命令）"，不用特殊处理 |

## 四、UI / 前端（含移动端适配）

| # | 坑 | 根源 | 对策 |
|---|---|---|---|
| P14 | 会话行点击 ⋯ 后行高 44→32 跳变、⋯ 按钮消失、列表整体跳动（像 UI 刷新） | 行是多类名元素（`sessionRow selected menuOpen …`），`[class$="_sessionRow"]` 后缀匹配只命中"该名是最后一个类"的时刻，一旦获得 `selected`/`menuOpen` 尾类规则即失效 | 多类名元素一律用**子串匹配** `[class*="_sessionRow"]`；或打自有 data 属性（`data-mobile-fit="expanded"`） |
| P15 | 官方类名带构建哈希前缀，直接写死全名会随 dsh 升级失效 | 构建哈希（如 `pI_x6G_`）随版本变化，语义后缀稳定 | 只依赖语义后缀 `[class$="_suffix"]` 与 `data-slot="<槽名>"`；上游升级后回归检查 |
| P16 | 设置面板/弹窗被限制在 320px 抽屉框内、显示一瞬间没铺满 | 抽屉 `transform` 使自身成为 fixed 后代的**包含块**；transform 过渡又延迟包含块切换 | 弹窗打开时对抽屉临时 `transform: none`（`:has([class$="_mask"])`）+ `transition: none`（否则过渡期间弹窗先在抽屉框内闪一下） |
| P17 | 模型页 403、插件配置页/权限/Agent 预设空白（远程访问） | dsh 把 settings/credentials 平面钉在**本机回环**，远程域名访问一律 403，多数表面静默吞错（`catch { return }`） | **属上游安全设计，不要绕过**；mobile-fit 在设置面板顶部显示双语横幅说明；电脑上用 `http://127.0.0.1:<端口>` |
| P18 | 内测声明每次刷新都弹出（远程访问） | 上游在远程浏览器（非 loopback）下用**内存**持久化确认状态 | mobile-fit 用 localStorage 补充持久化（键绑定上游声明版本号，文案变更时同步更新以重新提示一次） |
| P19 | 页面加载后的"预展开"与用户开抽屉的展开互相抵消 → 抽屉白屏只剩 × | 打开抽屉时遮罩挂载触发 MutationObserver → 展开逻辑在 React 重渲染前又点了一次展开开关（展开→收起） | 展开动作**每次加载最多一次**（幂等开关）；观察器触发的动作都要幂等 |
| P20 | 拦截 Enter 换行后：不发送了但换行不出现、光标消失，须再输入一个字符才恢复 | iOS Safari 上 `setRangeText` 不触发 `input` 事件，受控组件草稿不更新、光标错乱 | 拦截只 `stopPropagation()`、**不要** `preventDefault()`/手动插文本——让浏览器原生换行（光标/草稿/输入事件全走原生），React 发送处理器收不到按键即可 |

## 五、部署 / Tailscale

| # | 坑 | 根源 | 对策 |
|---|---|---|---|
| P21 | `tailscale serve` 首次使用报 "Serve is not enabled on your tailnet" | Tailscale 安全开关，需网页授权一次 | 用终端给的 `https://login.tailscale.com/f/serve?node=…` 链接 Enable |
| P22 | `https://<tailnet-ip>/` 打不开（TLS alert / schannel 不支持 IP SNI） | 本版 Serve 只为 **MagicDNS 域名**签证书；Windows schannel 对 IP 不发 SNI | 一律用 `https://<机器名>.<tailnet>.ts.net/`；测试用 Node/curl 而非 schannel |
| P23 | 自启任务必须防双实例 | 登录时用户可能已手动启动 | 自启脚本先查端口占用（`Get-NetTCPConnection -LocalPort`）再启动 |
| P24 | 手机键盘 Enter 会"发送"，用户期望换行 | 桌面习惯（Enter 发送）与手机输入法冲突 | 移动端 UI 里 Enter 一律换行，发送只走按钮（设计决策，非 bug） |
| P25 | 计划任务登录时弹出两个**空白的 powershell.exe 窗口**（无内容、每次重启都有） | 任务 Action 直接执行 `powershell.exe -WindowStyle Hidden -File …`：**SW_HIDE 标志在任务计划登录场景下不生效**，watchdog 控制台被创建并显示（标题=进程路径；内容为空是因为输出全部重定向到了日志文件） | 任务 Action 改为 **`wscript.exe` + `.vbs` 包装**（vbs 里 `WshShell.Run "powershell … -File …", 0, False`，SW_HIDE 由 wscript 侧施加）→ 登录时零窗口。⚠️ 千万不要对已托管的 WindowsTerminal/控制台窗口执行 `taskkill /T`——托管在其中的服务进程（dsh）会被连带终止，3080 挂掉 |
| P26 | `-WindowStyle Hidden` 的 powershell 仍弹窗（与 P25 同类） | 同上：任务计划启动时的 STARTF_USESHOWWINDOW 处理与交互式 shell 不同 | 同上：一律 vbs 包装；修改已注册任务用 `schtasks /change /tn <任务> /tr "wscript.exe …\xxx.vbs"` |

## 六、方法原则（来自教训）

1. **找根源**：现象 → 复现 → 读协议/源码确认根因 → 修复 → 回归。禁止"看起来对了就完"。
2. **横向排查**：一个场景出问题，检查同字段/同模式是否在其他场景也错（如 P11 的 `data.*` 问题同时影响历史与实时、所有事件类型）。
3. **性能类问题先量化**：先测数据量级（历史事件数、单条消息大小），再决定对策。
4. **零依赖优先**：能用 Node 内置能力就不用 npm 包，部署与维护成本最低。
5. **安全默认关**：认证、限流、审计、目录约束（越界 403）都是默认行为，不是可选项。

---

# Pitfall Log (Pitfalls)

> **Audience**: this file is for **developers / maintainers** (read before touching this project's code). Users who only want to use the project can skip it.
>
> **Rule**: read this file before modifying related code; append a new entry immediately whenever you hit a new pitfall.
> **Principles**: always find the **root cause**; when fixing, check whether the same pattern breaks **other scenarios** too; never patch a single symptom.

---

## 1. Windows / PowerShell Environment

| # | Pitfall | Root cause | Fix |
|---|---|---|---|
| P1 | `start-dsh.ps1` with Chinese comments fails to parse under Task Scheduler (Windows PowerShell 5.1) | PS 5.1 reads UTF-8-without-BOM files as ANSI (GBK); multibyte sequences swallow newlines | Keep scripts delivered to PS 5.1 **pure ASCII**; or save them as UTF-8 **with BOM** |
| P2 | JSON written by `Out-File -Encoding utf8` is rejected ("body is not JSON") | PS 5.1's `utf8` = with BOM; the BOM pollutes the first JSON byte | Write JSON with `[System.IO.File]::WriteAllText`; or strip the BOM manually |
| P3 | `curl -d "{\"a\":1}"` loses quotes in PowerShell; the server receives broken JSON | PowerShell quote-escaping when passing arguments to native programs | Always pass JSON bodies via `--data-binary "@file"` |
| P4 | `Set-Content -NoNewline` joins array elements into one line | `-NoNewline` does not add element separators | Pipe `@(...) \| Set-Content` (line by line); always re-parse `.env` after writing |
| P5 | Direct `git push` to GitHub gets connection reset | The network needs a proxy | Repo-level `git config http.proxy http://127.0.0.1:7890` (+https.proxy); don't touch the global config |

## 2. dsh Configuration & Hot Reload

| # | Pitfall | Root cause | Fix |
|---|---|---|---|
| P6 | `!!js` patch expression with a spaced array → dsh fails loudly at startup | dsh's `!!js` tag has `kind: "scalar"`; it accepts only a **single YAML scalar** | Wrap the whole JS expression in **double quotes as a string**: `trustedHosts: !!js "[...array...]"` |
| P7 | Changed `~/.dsh/profiles/web/cordis.patch.yml` and assumed a restart is needed | Profile patches are **hot-reloaded** by `watchUserPatches` (Cordis HMR) | Effective within seconds; but a **format error fails loudly** — back up before editing |
| P8 | `host.listDirectory` returns "needs the browse capability" | Directory picking is a seam: the native backend has no browse method; localhost resolves to native by default | Disable `directory-picker`(auto) in the patch and insert a `directory-picker-browse` row (side effect: desktop workspace picking becomes in-browser too) |
| P9 | Editing the profile patch can restart the dsh connection layer → established WebSockets all drop | HMR re-applies transactionally and rebuilds related plugin fibers | Consumers must **auto-reconnect** (exponential backoff); SSE writers must try/catch to avoid dead-client propagation |
| P10 | `session.search` reports "search is disabled: openAt never" | The web-app bundle defaults to `session-query-sqlite.openAt: never` (full-text search is opt-in) | Restate the whole line in the profile patch: `{path: ':memory:', openAt: first-search}` (lazy index on first search; hot-reload applies) |

## 3. dsh Protocol

| # | Pitfall | Root cause | Fix |
|---|---|---|---|
| P11 | Session history renders "error undefined / 🔧 undefined" | `SessionEvent` payloads live in the **`data`** field: `data.content`, `data.message.content`, `data.chunk.text`, `data.name`, `data.arguments`, `data.error`; the top level only has `type/seq/time` | Always read `ev.data.*`; never guess fields at the top level |
| P12 | `/api/workspaces/archiveSession` returns 404 | Wire paths = **full dotted method names**: `/api/workspace.archiveSession` (`session.list` → `/api/session.list`) | Build paths directly from the method name |
| P13 | `session.prompt` content starting with `/` is a slash command and doesn't consume the model | Official semantics | UI can hint "(/ starts a command)"; no special handling needed |

## 4. UI / Frontend (incl. mobile adaptation)

| # | Pitfall | Root cause | Fix |
|---|---|---|---|
| P14 | Tapping ⋯ on a session row: height snaps 44→32px, the ⋯ button vanishes, the list jumps (looks like a UI reload) | Rows carry multiple classes (`sessionRow selected menuOpen …`); `[class$="_sessionRow"]` suffix matching only hits when that name is the LAST class — adding `selected`/`menuOpen` breaks the rule | Use **substring matching** `[class*="_sessionRow"]` for multi-class elements; or add your own data attribute (`data-mobile-fit="expanded"`) |
| P15 | Hard-coded official class names break after dsh upgrades | Build hashes (e.g. `pI_x6G_`) change per version; semantic suffixes are stable | Depend only on semantic suffixes `[class$="_suffix"]` and `data-slot="<slot-name>"`; regression-check after upstream upgrades |
| P16 | Settings panel / dialogs get confined to the 320px drawer box and flash not-full-screen | The drawer's `transform` makes it the **containing block** for fixed descendants; the transform transition delays the containing-block switch | Temporarily set `transform: none` on the drawer while a dialog is open (`:has([class$="_mask"])`) plus `transition: none` (otherwise the dialog flashes inside the drawer box during the transition) |
| P17 | Models page 403; plugin-config/permissions/agent-presets blank (remote access) | dsh pins the settings/credentials plane to **loopback**; remote domains always get 403 and most surfaces swallow the error silently (`catch { return }`) | **Upstream security design — do not bypass**; mobile-fit shows a bilingual banner at the top of the settings panel; use `http://127.0.0.1:<port>` on the PC |
| P18 | Internal-testing notice pops up on every refresh (remote access) | Upstream persists the acknowledgement in **memory** for remote (non-loopback) browsers | mobile-fit adds localStorage persistence (key bound to the upstream notice version; bump the key when the copy changes to prompt once more) |
| P19 | The load-time "pre-expand" cancels out the user's drawer-open expand → drawer is blank except × | Opening the drawer mounts the scrim, which fires the MutationObserver → the expand logic clicks the same toggle again before React re-renders (expand then collapse) | Make the expand action **at-most-once per load** (idempotent flag); every observer-triggered action must be idempotent |
| P20 | Intercepting Enter for newline: no send, but no newline either, cursor disappears until the next character | `setRangeText` does not fire the `input` event on iOS Safari, so the controlled draft never updates and the cursor is lost | Intercept with `stopPropagation()` only — **no** `preventDefault()` / manual text insertion: let the browser insert the newline natively (cursor/draft/input event all native) while React's send handler never sees the key |

## 5. Deployment / Tailscale

| # | Pitfall | Root cause | Fix |
|---|---|---|---|
| P21 | `tailscale serve` first use: "Serve is not enabled on your tailnet" | Tailscale safety switch; needs one web authorization | Enable via the `https://login.tailscale.com/f/serve?node=…` link the terminal prints |
| P22 | `https://<tailnet-ip>/` won't open (TLS alert / schannel doesn't support IP SNI) | This Serve version issues certificates only for **MagicDNS domains**; Windows schannel sends no SNI for IPs | Always use `https://<machine>.<tailnet>.ts.net/`; test with Node/curl, not schannel |
| P23 | Autostart tasks must prevent double instances | The user may have started manually at login | The autostart script checks port usage (`Get-NetTCPConnection -LocalPort`) before starting |
| P24 | Phone keyboard Enter "sends" while users expect a newline | Desktop habit (Enter = send) conflicts with mobile keyboards | On mobile, Enter always inserts a newline; sending goes through the button only (design decision, not a bug) |
| P25 | Two **blank powershell.exe windows** pop at login (every reboot) | The task Action runs `powershell.exe -WindowStyle Hidden -File …` directly: **SW_HIDE is not honored in the Task Scheduler login scenario**, so the watchdog console is created and shown (title = process path; blank because output is redirected to logs) | Wrap the task Action with **`wscript.exe` + `.vbs`** (`WshShell.Run "powershell … -File …", 0, False` — SW_HIDE applied by wscript) → zero windows at login. ⚠️ Never run `taskkill /T` against a hosted WindowsTerminal/console — the service processes (dsh) hosted inside it get killed too and 3080 dies |
| P26 | `-WindowStyle Hidden` powershell still pops a window (same family as P25) | Same as above: STARTF_USESHOWWINDOW handling at Task Scheduler startup differs from interactive shells | Same: always use the vbs wrapper; update an existing task with `schtasks /change /tn <task> /tr "wscript.exe …\xxx.vbs"` |

## 6. Methodology (lessons learned)

1. **Find the root cause**: symptom → reproduce → confirm against protocol/source → fix → regression. Never settle for "looks right".
2. **Check laterally**: when one scenario breaks, check whether the same field/pattern breaks elsewhere (e.g. P11's `data.*` issue affects both history and live events, all event types).
3. **Quantify performance problems first**: measure the data volume (event counts, message sizes) before choosing a fix.
4. **Zero-dependency first**: prefer Node built-ins over npm packages; lowest deployment and maintenance cost.
5. **Secure by default**: authentication, rate limiting, auditing, and directory constraints (out-of-bounds 403) are defaults, not options.
