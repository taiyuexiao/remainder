# M32 AI 助手 A2：动作快照 + 一键撤销

> 代码与 M31 同期完成（随 agent loop 一起写在工作区），本里程碑补验证与文档。

## 内容

- `server/src/db/schema.ts` v16：`agent_actions` 表（tool/params/undo_table/undo_id/before_json/undone）
- 写工具执行器返回 `UndoInfo`：create 类 before=NULL（撤销=删行），改类存 before 行快照
- `server/src/routes/chat.ts`：写动作落 `agent_actions`；`POST /api/agent-actions/:id/undo`（幂等，已撤销报 400）
- `desktop/src/pages/ChatPage.tsx`：动作卡片带「↩」按钮，确认后撤销并划线标记
- M34 起撤销逻辑重构进 `agentTools.executeAgentUndo`（支持复合工具专用分支），路由只做鉴权与状态标记

## 验证

- 真实 DeepSeek e2e（`server/scripts/e2e-m34.mjs`）：agent 建想法 → undo 200 → 任务消失 → 重复 undo 400
- 工具级（`server/scripts/tooltest-m34.ts`）：create/update 两类 undo 全过（含 M34 新增表）

## 报错及解决方案

| 报错 | 原因 | 解决 |
| --- | --- | --- |
| （无新增，沿用 M31 验证链路） | — | — |

## 遗留

- 撤销是单步逆操作，无链式批量撤销
- 老会话历史消息里的动作 id 重启后仍可撤销（agent_actions 持久化），但已撤销状态只在当前页内存划线，刷新后按钮仍在（点了会收到 400 提示）
