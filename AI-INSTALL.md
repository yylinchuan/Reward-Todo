# 给安装 AI 的说明

这份说明用于把“小票待办”接入一位 CyberBoss 用户的 AI 工作区。请先阅读完再操作。

## 不可越过的边界

- 先运行 `Plan`，把结果完整展示给用户；得到用户明确同意后才运行 `Apply`。
- 不复制仓库作者或其他人的 SQLite、备份、`.env`、聊天记录或个人数据。
- 不覆盖 `.mcp.json` 中已有的 MCP 服务；安装器只新增 `reward_todo`。
- 不设置 Windows 登录自启动，不重启 CyberBoss，不修改模型、密钥、远程仓库或网络暴露。
- 不把 `127.0.0.1:3210` 暴露到公网。
- 卸载默认保留用户自己的待办数据库。

## 安装步骤

1. 确认 Windows 已安装 Node.js 22.5 或更新版本。
2. 下载或克隆本仓库，保留在一个稳定、不会随手删除的位置。
3. 找出用户实际与 AI 对话的工作区目录；该目录中会创建或合并 `.mcp.json`。
4. 只预演：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-for-cyberboss.ps1 `
  -Mode Plan `
  -WorkspaceRoot "D:\path\to\the-ai-workspace" `
  -CyberBossRoot "D:\path\to\cyberboss" `
  -UserName "用户希望显示的名字" `
  -AssistantName "AI 希望显示的名字" `
  -CreateDesktopShortcut
```

5. 向用户说明预演中的服务目录、数据目录、配置文件、网页地址、桌面快捷方式和主动提醒适配状态。获得明确同意后，把 `Plan` 改为 `Apply` 再运行。若 `frontendBuild=missing`，先明确说明需要下载前端开发依赖；得到同意后运行 `npm --prefix web install` 和 `npm run web:build`，不要执行 `npm audit fix --force`。
6. 安装器不会重启。请让用户自行重新进入 AI 工作区，然后体检：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\doctor.ps1 `
  -WorkspaceRoot "D:\path\to\the-ai-workspace"
```

7. 让 AI 只读调用 `reward_todo_manage`，依次执行 `status`、`list`、`calendar`，确认能返回空白或用户自己的数据。不要用写入操作冒充验收。
8. 若创建了桌面快捷方式，让用户自行点击打开，确认日历、今日小票、奖励柜能显示；安装 AI 不替用户点击或启动长期进程。

## 能力边界

直接 MCP 接入后，AI 可使用一个总管工具完成：待办增删改查、每日打卡、完成日历、积分、奖励柜。它按需启动 MCP 子进程，不要求 Reward-Todo HTTP 服务常驻。网页只在用户点击快捷方式后启动本机服务。

21:30 未完成事项主动递送属于 CyberBoss 适配能力。安装器只负责检测当前 CyberBoss 是否已有兼容适配，不会向未知版本源码强行打补丁：

- `ready`：可在用户自行重启 CyberBoss 后继续做只读/真实提醒验收。
- `present_not_enabled`：适配代码存在，但没有检测到开启配置；先向用户说明，再由其 CyberBoss AI 检查本机配置。
- `not_installed`：普通 AI 操作仍可用，但不会自动把晚间提醒送进既有聊天线程。
- `not_checked`：安装时没有提供 CyberBoss 目录，尚未判断。

不要把“数据库已生成 outbox”说成“提醒已送达”；真实递送必须另行验收。

## 卸载

先告诉用户卸载会移除工作区的 `reward_todo` MCP 配置，但默认保留个人数据。用户同意后运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\uninstall-for-cyberboss.ps1 `
  -WorkspaceRoot "D:\path\to\the-ai-workspace"
```

如要删除个人数据库，必须另行备份并取得用户明确同意；本脚本故意不提供静默删库选项。
