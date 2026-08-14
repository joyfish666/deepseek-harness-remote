# deepseek-harness-remote

基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）的**远程控制项目**：让其他设备（手机、平板、其他电脑）通过网络远程控制本机正在运行的 harness —— 远程启动任务、查看运行状态、管理会话。

## 目录结构

| 路径 | 说明 |
|---|---|
| `deepseek-harness-master/` | 官方上游代码（**仅本地参考，不推送 GitHub**，已加入 `.gitignore`） |
| `docs/` | 方案与设计文档 |

## 当前状态

- [x] 本地项目与远端仓库绑定（本仓库，`deepseek-harness-master` 除外）
- [x] 远程控制方案设计（见 `docs/remote-control-plan.md`）
- [ ] 方案实施（建议从「隧道 + 现有 GUI」开始）
