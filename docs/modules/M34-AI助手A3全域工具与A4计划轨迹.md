# M34 AI 助手 A3 全域工具 + client_actions 联动 & A4 plan 确认模式 + 轨迹回放

## 内容

### A3：工具集 11 → 21

新增（`server/src/llm/agentTools.ts`，全部复用路由/服务层逻辑）：

| 工具 | 说明 | 撤销 |
| --- | --- | --- |
| kb_search | 搜个人知识库 | 读 |
| kb_create / kb_update | 沉淀/更新知识条目（TTL 复用路由 computeExpiresAt） | 删行 / 回写快照 |
| kb_publish | 发布到团队收件箱（团队名模糊匹配） | 删 publications 行 |
| convert_clip | 剪藏转文档（复用 clips 转换逻辑+图片绝对路径） | 复合：删文档+回恢复剪藏状态 |
| clip_to_knowledge | 剪藏沉淀为好文条目 | 删行 |
| generate_report | 日/周/月报（复用 reports.ts 抽出的 createReport） | 删行 |
| urge_follow | 催办（urge_count+1） | 专用：回写 follow_ups 快照（主键 task_id） |
| open_document / navigate_to | 前端联动（不产生数据变更） | — |

撤销统一收口到 `executeAgentUndo`（通用表白名单 tasks/projects/documents/doc_folders/inbox/knowledge_items/reports/publications + 复合工具专用分支）。

### A3：client_actions 前端联动

- 链路：工具返回 `clientAction` → agentLoop 汇总 → chat 响应 `clientActions` → ChatPage `runClientActions` → `desktop/src/navBus.ts`（新）
- navBus：`requestOpenDoc` = pendingDocId 暂存 + `app-nav` 切栏目 + `fe-nav-doc` 选文档（与 M33 编辑器内跳转复用同一事件）；App.tsx 监听 app-nav 校验 NavKey 后切页；DocsPage 挂载时消费 pending（覆盖"事件先于挂载"竞态）

### A4：plan 确认模式

- ChatPage 输入区「📋 计划模式」开关：开启后发消息走 `agentPlan`（不挂工具，只出编号计划；简单需求 LLM 会答"无需计划"）
- 计划卡片 [▶ 执行计划] [取消]：执行 = 以"原始需求+已确认计划"重跑 agent loop；取消/执行状态持久化在消息 actions JSON（cancel-plan 路由）

### A4：轨迹回放

- schema v17：`agent_runs` 表（conv_id/message_id/user_msg/plan_mode/rounds/reply）
- agentLoop 记录每轮 `{thought, calls:[{tool,params,result}]}`
- `GET /api/agent-runs/by-message/:messageId`；ChatPage 助手消息时间戳旁「轨迹」→ 模态窗按轮次回放

## 验证

- `pnpm --filter server build` + `pnpm --filter desktop build` 0 错误
- 工具级确定性测试 `server/scripts/tooltest-m34.ts`（tsx，无 LLM）：24/24 PASS（10 个新工具 + 各自撤销 + clientAction）
- 真实 DeepSeek HTTP e2e `server/scripts/e2e-m34.mjs`（独立 PORT=3399）：13/13 PASS（plan 不执行→执行→标记 executed→轨迹落库→undo→重复 undo 400）
- UI e2e（headless Edge + puppeteer-core，用完即删）：8/8 PASS（计划卡片出现→执行→动作卡→已执行标记→轨迹模态→requestOpenDoc 真实链路打开文档）

## 报错及解决方案

| 报错 | 原因 | 解决 |
| --- | --- | --- |
| UI e2e 手动 dispatch app-nav+fe-nav-doc 打不开文档 | 两事件同步连发，DocsPage 还没挂载，fe-nav-doc 丢失 | 这正是 navBus pendingDocId 要解决的竞态；测试改走真实 `requestOpenDoc`（vite dev 下 `import('/src/navBus.ts')`） |
| plan e2e 断言"编号列表"失败 | agentPlan 提示词允许简单需求答"无需计划" | 属预期行为，断言放宽为两者皆可 |

## 遗留

- kb_publish 只支持发布到其他团队（个人空间无意义），无团队时报错信息由 LLM 转述
- 计划"取消"只标状态，再次发送相同需求会生成新计划卡片（互不影响）
- 轨迹回放是模态窗而非独立页面（方案中的"回放页"按需再升级）
