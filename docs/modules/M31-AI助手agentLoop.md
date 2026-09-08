# M31 AI 助手 agent loop（A1：自然语言操控系统）

> 方案：`docs/research/AI助手-自然语言操控系统方案.md`。A1 = agent loop + 11 个系统工具 + 动作轨迹卡片。

## 实现

### server

- **`llm/agentLoop.ts`**：DeepSeek function calling 多轮循环（≤8 轮硬上限）。system prompt 注入今日日期 + 工作原则（果断调工具/多步链式/查询拿真实数据/先搜后改）。每轮把 assistant 的 tool_calls 执行结果以 `role: tool` 回喂，直到无工具调用产出终局回复；轨迹（tool/params/result）随回复返回
- **`llm/agentTools.ts`**：11 个工具（JSON Schema + 执行器，**直接操作 db，复用现有路由内部逻辑**）：
  - 读：`query_schedule`（today/tomorrow/week/overdue）、`search_documents`、`read_document`
  - 写：`create_task`（idea/项目/子任务/follow）、`update_task`、`complete_task`、`create_document`、`format_document`（复用 M16 LLM 排版）、`update_document`（含 append）、`move_document`（文件夹不存在自动建）、`quick_note`
  - 红线落实：**无删除类工具**；标题模糊匹配找不到先返回提示让 agent 用 search 类工具
- **`routes/chat.ts`**：消息处理从 chatAssistant（单轮意图）切换为 agentReply；轨迹摘要存 `chat_messages.actions`，前端动作卡片原样兼容

### 实测轨迹（真实 DeepSeek，生产库）

| 输入 | 轨迹 | 结果 |
|---|---|---|
| "明天下午5点提醒我交周报" | create_task | ✓ 想法落库（2026-09-09T17:00） |
| "我明天有什么安排" | query_schedule(tomorrow) | ✓ 真实数据回答（并据此补了 tomorrow 范围） |
| "搜'散乱'文档，整理好格式移到 m31测试 文件夹" | search_documents → read_document → format_document → move_document | ✓ 标题层级重建（h1/h2 规范化）+ 移入自动创建的文件夹 |

## 报错及解决方案

| 报错 | 原因 | 解决 |
|---|---|---|
| 查"明天的安排"答非所问 | query_schedule 初版只有 today/week/overdue | 补 tomorrow 范围（system prompt 无法弥补工具能力缺口） |

## 验证

- 三轮真实 LLM 端到端（上表），含用户原例"散乱文档排版+移文件夹"完整链路
- `pnpm --filter server build` 0 错误；桌面无改动（动作卡片 UI 天然兼容）

## 后续（A2/A3 排队）

- A2：agent_actions 快照表 + 动作卡片「↩ 撤销」
- A3：知识库/剪藏/报告工具 + client_actions 前端页面联动
