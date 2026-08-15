# dsh Web 远程访问与移动端适配——从零开始（mobile-fit）

> 🌐 **语言**：[English](tutorial.md) · 中文

> 本文面向**所有用户**：读完即可从 0 到"电脑 + 手机都能用"。
> 想了解项目全貌请看根目录 `README.zh-CN.md`；开发者请另读 `pitfalls.zh-CN.md`。

---

## 0. 前置条件

| 需要 | 说明 |
|---|---|
| 电脑 | Windows / macOS / Linux，已安装 Node.js（≥22） |
| dsh | `npx @deepseek-ai/dsh web` 可正常启动（默认 `127.0.0.1:3080`） |
| 手机（可选） | 安卓 / iOS，安装 [Tailscale](https://tailscale.com/download) App（仅远程访问需要） |
| Tailscale 账号（可选） | 免费版即可，电脑与手机登录**同一账号** |

> 只想本机用：只需电脑 + Node.js，跳过第 2 节即可。

---

## 1. 启动 dsh Web（手动方式）

**方式 A：命令行启动**（最简单）

```sh
npx @deepseek-ai/dsh web
```

浏览器打开 `http://127.0.0.1:3080`，看到官方界面即成功。窗口关闭 = 停止服务。

**方式 B：用仓库脚本启动**（Windows）

双击 `scripts/start-dsh.ps1`（或在终端运行）。脚本特性：

- 以 node 直接运行（无 cmd.exe 包装窗口）；
- 进程崩溃 **10 秒后自动重启**（看门狗）；
- 端口被占用则退出（避免双实例）；
- 日志：`~/.dsh/logs/dsh-web.log`。

> 两种方式二选一即可。**开机自启不是必须的**——你也可以每次手动启动（见第 4 节）。

---

## 2. 手机远程访问（可选）

> 目标：手机浏览器打开 `https://<机器名>.<tailnet>.ts.net/` 就能访问电脑上的 dsh。

### 2.1 组网

1. 电脑安装 Tailscale 并登录；手机装 App 并登录**同一账号**；
2. 验证：`tailscale status` 能看到两台设备（`100.x.y.z` 形式 IP）。

### 2.2 启用 Serve（一次性管理员授权）

```sh
tailscale serve --bg 3080
```

首次会打印 `https://login.tailscale.com/f/serve?node=xxxx`，用浏览器打开并点
**Enable**，然后重新执行上面的命令，看到 `Serve started and running in the
background` 即成功。

### 2.3 配置 dsh 信任围栏

dsh 的 `/api` 只放行 loopback 或 `trustedHosts` 中的 Host。编辑
`~/.dsh/profiles/web/cordis.patch.yml`（Windows：`%USERPROFILE%\.dsh\...`），
不存在则新建：

```yaml
- id: connection
  config:
    trustedHosts: !!js "['<你的机器名>.<你的tailnet>.ts.net', ...ctx.webRuntime.trustedHosts]"
```

- `<你的机器名>.<你的tailnet>.ts.net` 用 `tailscale serve status` 输出里的域名；
- ⚠️ `!!js` 只接受单个 YAML 标量，**整个表达式必须用双引号包裹**；
- 该文件由 dsh 热重载，**无需重启 dsh**，几秒内生效。

### 2.4 验证

手机浏览器（保持 Tailscale App 连接）打开：

```
https://<你的机器名>.<tailnet>.ts.net/
```

> ⚠️ 用**域名**不要用 IP：Tailscale Serve 只为域名签发 TLS 证书。

---

## 3. 启用手机适配（mobile-fit，可选但推荐）

手机窄屏时自动获得移动端布局（抽屉导航、会话操作、输入体验、设置面板全屏化等）。

### 3.1 挂载插件（junction，改代码即生效）

```powershell
$nm = "$HOME\.dsh\profiles\web\node_modules"
New-Item -ItemType Directory -Force $nm | Out-Null
cmd /c mklink /J "$nm\mobile-fit" "<仓库路径>\mobile-fit"
```

> junction 而非复制：以后更新本仓库代码，刷新页面即生效。

### 3.2 追加 patch 行

在 `~/.dsh/profiles/web/cordis.patch.yml` 末尾追加：

```yaml
- insert:
    - id: mobile-fit
      name: 'mobile-fit'
```

### 3.3 重启 dsh web

client 插件集合在启动时扫描，热重载不会新增插件行：

```powershell
schtasks /end /tn dsh-web    # 若注册了自启任务，看门狗 10 秒后自动拉起
```

未注册自启任务的话，直接重启 dsh 进程即可。

### 3.4 验证

手机打开入口：左上角出现 ☰，点击弹出侧栏抽屉（直接显示会话列表，右上角 × 关闭）；
输入框回车换行、右下角箭头发送。电脑宽屏无任何变化。

---

## 4. 可选：开机自启

> **不是必须的**。不想要就跳过——每次手动启动（第 1 节）完全够用。
> 若启用，登录电脑后 dsh 自动在后台运行，无需任何窗口。

### 4.1 注册任务（wscript + vbs，登录零窗口）

```powershell
$action = New-ScheduledTaskAction -Execute 'wscript.exe' `
  -Argument '"<仓库路径>\scripts\start-dsh.vbs"'
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName 'dsh-web' -Action $action -Trigger $trigger -Settings $settings -Force
```

> 为什么用 wscript + vbs：计划任务直接执行 `powershell.exe -WindowStyle Hidden`
> 时，隐藏标志在登录场景下**不生效**，会弹出空白窗口（见 `pitfalls.zh-CN.md` P25/P26）。

### 4.2 管理命令

| 操作 | 命令 |
|---|---|
| 查看任务 | `Get-ScheduledTask -TaskName dsh-web` |
| 立即启动 | `schtasks /run /tn dsh-web` |
| 重启 | `schtasks /end /tn dsh-web`（看门狗 10 秒后自动拉起） |
| 停用自启 | `Unregister-ScheduledTask -TaskName dsh-web` |

> Tailscale 是系统服务、serve 配置持久保存，重启电脑自动恢复，无需处理。

---

## 5. 彻底卸载（还原到部署前，无残留）

以下步骤按需执行，全部执行后项目痕迹清零：

```powershell
# 1.（若启用过自启）注销计划任务
Unregister-ScheduledTask -TaskName dsh-web

# 2. 关闭 serve 转发（手机立即无法访问）
tailscale serve --https=443 off
tailscale serve status        # 应显示 No serve config

# 3. 恢复 dsh 配置：把 cordis.patch.yml 恢复为初始内容（热重载生效，无需重启）
#    删除 trustedHosts 段与 mobile-fit insert 段，恢复为：
#    -------
#    # Your patch layer for this dsh profile, applied after every bundle layer:
#    []
#    -------

# 4. 删除 mobile-fit junction（解除挂载）
Remove-Item "$HOME\.dsh\profiles\web\node_modules\mobile-fit"

# 5. 停止 dsh web（若在运行）：关闭其窗口，或 schtasks /end /tn dsh-web
```

**验证还原**：手机打不开原地址；电脑本地 `http://127.0.0.1:3080` 正常（dsh 本身
不受影响）；`curl -H "Host: <任意tailnet地址>" http://127.0.0.1:3080/api/session.list`
返回 `403`（围栏恢复）。

> 仓库本身可保留（不影响任何东西）；不需要时删除本仓库目录即可，无后台残留。

---

## 6. 手机端功能验证清单

| 领域 | 期望行为 |
|---|---|
| 侧栏 | ☰ 打开抽屉 → 直接显示会话列表（无图标栏），× / 遮罩关闭 |
| 会话行 | 行高 44px；⋯ 菜单可用（重命名/分叉/归档） |
| 标题/统计栏 | 顶部会话名与底部统计栏可左右滑动查看完整内容 |
| 输入 | 回车换行（不发送），右下角箭头发送；输入区贴底；切换会话不自动弹键盘（点输入框才聚焦） |
| 设置 | 面板全屏显示，顶部横向标签切换分区，内容可滚动 |
| 内测声明 | 首次点"继续"后不再弹出 |

---

## 7. 已知限制（dsh 上游安全设计）

配置/凭据类接口（模型页、插件配置、权限、Agent 预设等）**仅限本机回环访问**：
远程域名访问一律 403（模型页报错、其余页面大多静默空白）。这是 dsh 上游的安全
设计，不是本项目问题。需要使用时请在**运行 dsh 的电脑**浏览器打开
`http://127.0.0.1:<端口>`。

通用设置页里的语言/外观等不依赖该平面，远程正常可用。

---

## 8. 更多文档

| 文档 | 读者 |
|---|---|
| [mobile-fit/README.zh-CN.md](../mobile-fit/README.zh-CN.md) | 开发者：插件包原理、自定义、已知说明 |
| [pitfalls.zh-CN.md](pitfalls.zh-CN.md) | 开发者：踩坑记录（仅使用的用户可跳过） |
