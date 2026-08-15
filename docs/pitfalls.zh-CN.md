# 踩坑记录（Pitfalls）

> 🌐 **语言**：[English](pitfalls.md) · 中文

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
| P17 | 模型页 403、插件配置页/权限/Agent 预设空白（远程访问） | dsh 把 settings/credentials 平面钉在**本机回环**，远程域名访问一律 403，多数表面静默吞错（`catch { return }`） | **属上游安全设计，默认不要绕过**；部署 remote-config 反代（`docs/remote-config.zh-CN.md`）后可解锁 |
| P18 | 内测声明每次刷新都弹出（远程访问） | 上游在远程浏览器（非 loopback）下用**内存**持久化确认状态 | mobile-fit 用 localStorage 补充持久化（键绑定上游声明版本号，文案变更时同步更新以重新提示一次） |
| P19 | 页面加载后的"预展开"与用户开抽屉的展开互相抵消 → 抽屉白屏只剩 × | 打开抽屉时遮罩挂载触发 MutationObserver → 展开逻辑在 React 重渲染前又点了一次展开开关（展开→收起） | 展开动作**每次加载最多一次**（幂等开关）；观察器触发的动作都要幂等 |
| P20 | 拦截 Enter 换行后：不发送了但换行不出现、光标消失，须再输入一个字符才恢复 | iOS Safari 上 `setRangeText` 不触发 `input` 事件，受控组件草稿不更新、光标错乱 | 拦截只 `stopPropagation()`、**不要** `preventDefault()`/手动插文本——让浏览器原生换行（光标/草稿/输入事件全走原生），React 发送处理器收不到按键即可 |
| P27 | 手机端切换会话时输入框被自动聚焦、键盘弹出 | 上游 InputBar 的 unlock 效果在 mount/sessionId 变化时执行 `el.focus()`（桌面习惯：选中会话即可直接输入）；手机端无手势参与，键盘被拉起。**坑中坑**：脚本 `focus()` 派发的 focus/focusin 事件 `isTrusted` 仍为 `true`（UA 内部聚焦步骤执行，非脚本 `dispatchEvent`），**不能用 `isTrusted` 区分用户点击与脚本聚焦**（第一版修复即因此失效） | 以**指针轨迹**为准：composer dock 内 600ms 内的 `pointerdown` = 输入意图（放行，真实点按与发送按钮 keep-focus 都在此窗口）；其他来源的 composer 聚焦一律 `preventDefault()`（Chrome 直接取消聚焦，无键盘闪烁）+ `blur()` 兜底（不可取消的引擎） |

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

## 七、安卓壳（apk/）

| # | 坑 | 根源 | 对策 |
|---|---|---|---|
| P28 | 代码在 minSdk 26 的设备上崩（`NoSuchMethodError: String.isBlank`） | `String.isBlank()` 是 API 33 才有的 Java 11 API；AGP 默认不做 core-library desugaring | 一律用 `trim().isEmpty()`；提交前检查是否用了高版本 API（IDE lint / API 差异表） |
| P29 | `services.gradle.org` 下载 Gradle 发行包连接重置（`curl: (56)`），代理 127.0.0.1:7890 秒下 | 本机网络到该域不稳定（P5 同因） | wrapper `distributionUrl` 指向 `https://mirrors.cloud.tencent.com/gradle/...`（已验证可达）；或 `curl -C - -x http://127.0.0.1:7890` 断点续传 |
| P30 | `gradlew` 下载发行包 .part 文件 0 字节停滞，而 curl/.NET 均可达同一 URL | wrapper 的 Java HTTP 栈与镜像 CDN 的连接问题（代理/重定向差异） | 预置 wrapper 缓存：把 zip 解压到 `~/.gradle/wrapper/dists/<名称>/<hash>/` 并创建 `.ok` 文件（wrapper 跳过下载）；本机构建直接用本地解压的 gradle |
| P31 | `gradle wrapper` 报 "repository 'maven' was added by initialization script" | 本机全局 `~/.gradle/init.gradle`（阿里云镜像）往项目加仓库，与 settings 里 `repositoriesMode = FAIL_ON_PROJECT_REPOS` 冲突 | 该项目去掉 `FAIL_ON_PROJECT_REPOS`（init 脚本镜像对国内网络有益）；不要改全局 init.gradle |
| P32 | PowerShell 执行 `gradlew.bat` 返回 exit code 1，但日志明明 "BUILD SUCCESSFUL" | gradlew.bat 把 javac 的 stderr（"注: ...使用或覆盖了已过时的 API"）当错误输出，PowerShell 把原生程序 stderr 判定为 NativeCommandError | 判断成败以输出里的 `BUILD SUCCESSFUL/FAILED` 为准，不要看 exit code；javac 的过时 API 提示用 `-Xlint:deprecation` 另行处理 |

## 八、远程配置反代（remote-config proxy）

| # | 坑 | 根源 | 对策 |
|---|---|---|---|
| P33 | 反代改了 Host 但配置接口仍 403 | Chrome 对同源 POST/fetch **也带 Origin 头**（与页面同源），Host 改成回环后 `Origin` 与 `Host` 不匹配，被 Origin fence 拒绝（`api-request-trust.ts`：Origin 存在时必须与 Host 完全一致） | 反代必须**删除 Origin 头**（不是改写）——Origin 缺失时围栏直接放行 |
| P34 | 反代后页面正常，但会话事件流（WS）不更新 | `http.request` 默认不处理 Upgrade；转发升级请求时必须显式保留 `Connection: Upgrade` 与 `Upgrade: websocket` 头（node 会剥离 hop-by-hop），101 响应要手写并用 `res.rawHeaders` 原样中继（保 `Sec-WebSocket-Accept` 等），再双向 `pipe` | 见 `scripts/remote-config-proxy.mjs` 的 `server.on('upgrade')`：`agent: false` + 显式头 + 手写 101 + 双 socket `pipe` + 双向 error 兜底 |
