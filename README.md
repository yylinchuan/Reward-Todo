# Reward-Todo

一个独立、可关闭、local-first 的奖励待办、固定日常打卡与完成日历。它不依赖 CyberBoss 才能保存数据；CyberBoss 只是可选的 AI 与主动提醒适配器。

## 当前能力

- 人类通过本机 REST 创建、修改、打卡和归档。
- AI 通过 MCP 创建、修改和查询；只有用户明确说完成后才允许代打卡。
- 固定日常每天复位当前状态，但保留逐日打卡历史与月度统计。
- 一次性任务未完成会继续保留，完成后次日软归档。
- 一次性任务不展示“从昨天继承”；只在实际完成日写入只读历史小票。
- 每项任务可设置完成积分；积分用追加流水记录，撤销完成会写反向流水。
- 奖励柜支持人类与 AI 增删改查；AI 兑换或归档前必须取得本轮明确确认。
- 定时提醒以 outbox 形式原子认领；投递失败在 15 分钟内可重试。
- 每晚 21:30 后首次运行会生成一次未完成清单收尾提醒；当天未运行则不追补旧日期。
- 分享安装时，个人数据默认存放在 `%LOCALAPPDATA%\RewardTodo\data\checklist.sqlite`；可以用环境变量改到其他位置。
- 从旧版原地升级时，如果仓库上一级已有 `.todo-service` 数据目录，会继续沿用，不会悄悄切到空白库。
- 内置独立网页：日历、今日小票、积分和奖励柜都在同一页面，不需要安装 Dashboard。

## 命令

```powershell
cd D:\path\to\Reward-Todo
npm test
npm run status
npm run backup
npm start
```

网页构建：

```powershell
npm --prefix web install
npm run web:build
```

启动后访问 `http://127.0.0.1:3210/`。仓库会保留已经构建好的前端，因此普通使用者不必为了打开小票安装前端开发依赖。

`npm run backup` 使用 SQLite 自身生成一致性快照，保存到当前数据目录的 `backups` 子目录；无需手工追着 WAL 文件复制。

首次确认功能稳定后，可由用户手动安装登录自启动：

```powershell
npm run autostart:install
```

它创建计划任务 `Reward-Todo-Service`，运行独立 watchdog。关闭或拆除：

```powershell
npm run service:stop
npm run autostart:remove
```

安装和移除计划任务不会由程序静默执行。

HTTP 默认只监听 `127.0.0.1:3210`。MCP 入口：

```powershell
node D:\path\to\Reward-Todo\bin\todo-service.js mcp
```

## 分享给其他 CyberBoss 用户

仓库提供一个只暴露单一总管工具 `reward_todo_manage` 的便携 MCP 入口，避免把十个待办工具一次性塞进 AI 上下文：

```powershell
node .\bin\todo-service.js mcp-gateway
```

朋友可以把本仓库交给自己的 AI，并让它严格按照 [AI-INSTALL.md](AI-INSTALL.md) 操作。安装流程具备以下边界：

- 必须先只读预演，再由用户明确同意应用。
- 合并而不是覆盖工作区现有 `.mcp.json`。
- 首次使用创建空白本地数据库，不附带作者的个人数据。
- 不设置开机自启动，不自动重启 CyberBoss。
- 卸载只移除自己的 MCP 配置，默认保留用户数据。
- 可选创建“Reward-Todo”桌面快捷方式；只在点击时启动网页服务，不随 Windows 登录启动。

直接 MCP 接入支持待办、打卡、日历、积分和奖励柜。21:30 主动把未完成事项送进原聊天线程，还需要兼容的 CyberBoss 提醒适配；安装器会检测并如实报告，不会向未知版本强行打补丁。

可直接复制给朋友 AI 的任务说明见 [INSTALL-PROMPT.zh-CN.md](INSTALL-PROMPT.zh-CN.md)。

## 环境变量

- `TODO_SERVICE_STATE_DIR`
- `TODO_SERVICE_DATABASE_FILE`
- `TODO_SERVICE_HOST`（应保持 `127.0.0.1`）
- `TODO_SERVICE_PORT`（默认 `3210`）
- `TODO_SERVICE_TIME_ZONE`（默认 `Asia/Shanghai`）
- `TODO_SERVICE_REMINDER_RETRY_MINUTES`（默认 `15`）
- `TODO_SERVICE_CLOSEOUT_TIME`（默认 `21:30`）
- `TODO_SERVICE_USER_NAME`（小票上的顾客名称）
- `TODO_SERVICE_ASSISTANT_NAME`（小票上的柜员名称）
- `TODO_SERVICE_APP_NAME`（小票品牌名称）
- `TODO_SERVICE_REMINDER_DELIVERY_MODE`（由安装器写入主动提醒适配状态）

## 安全边界

- HTTP 入口固定把写入者记为 `user`，不接受客户端伪造 `createdBy`。
- MCP 入口固定把写入者记为 `assistant`。
- 助手归档必须传 `confirmed=true`，表示用户在本轮明确确认。
- 这是生活管理工具，不用于医疗诊断；敏感健康数据不应写进普通待办正文。


## 致谢与许可

小票清单的概念和视觉参考来自 [nonchaiovo/timed-checklist](https://github.com/nonchaiovo/timed-checklist)。第三方说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。本项目使用 MIT License。
