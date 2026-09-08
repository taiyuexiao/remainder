# AI 助手升级方案：自然语言操控系统（agent loop + 工具集）

> 2026-09-07 · 需求：AI 助手从"聊天+建任务"升级为**通过对话操作整个系统**的入口（参考 Codex agent 模式："明天的日程是去洛杉矶"→自动入日程；"把这篇散乱文档排好版放进 X 文件夹"→自动执行）。
> 先盘点后方案，不动代码。

## 1. 全应用可介入面盘点

| 域 | 现有能力（server 路由全齐） | 对话式操作举例 |
|---|---|---|
| **任务** | tasks/projects CRUD、完成/归档、ddl、标签、优先级 | "明天下午5点交周报"（已支持）、"把 NAC 评测的 ddl 推到周五"、"完成文档整理这个任务" |
| **跟进** | follow_ups（@人、下次跟进日、催促计数） | "提醒我周二催一下顾老师"（已支持） |
| **日程查询** | today 视图、日历区间、全景数据 | "明天的安排是什么"、"这周哪些逾期了"（读操作，零风险好入手） |
| **文档** | documents CRUD、嵌套文件夹、FTS 搜索、移动、导出、**M16 AI 排版** | 用户原例："把这篇散乱文档排好版放进某文件夹" = search → read → **formatDoc（M16 现成）** → update → move |
| **Inbox/剪藏** | inbox 收集/转任务、clips 转文档/沉淀 | "把 inbox 里关于 harness 的都转成文档"、"这条剪藏沉淀到知识库" |
| **知识库** | 七类型条目 CRUD、四层、@人、评论、发布/同步、草稿 | "把刚才讨论的结论沉淀成经验条目"、"发布到后端组" |
| **报告** | 日/周/月报生成+编辑+列表 | "生成本周周报"、"把周报导出" |
| **画布** | boards/items CRUD | "把这篇文章加到调研画布" |
| **系统/个性化** | 背景图、提醒开关、LLM 配置 | "背景图关掉"、"提醒我改成每晚8点" |

**结论：server 端 95% 的能力已有现成路由，缺的不是能力，是一个"能用这些能力的 agent 决策层"。**

## 2. 现状与差距

当前 M19 chatAssistant = **单轮意图识别 → 动作 JSON → 落库**：
- 只能做"建任务/建项目/跟进/想法/inbox"五类创建动作
- 单轮、无工具概念、无查询能力（问"明天安排"答不了）、无多步操作（用户要的"排版+移动"是两步）

参考 Codex/DSH：**agent loop（多轮 function calling）+ 工具集 + 轨迹可视**。DeepSeek `deepseek-chat` 原生支持 tools（function calling），基础设施零新增。

## 3. 方案：agent loop + 系统工具集

### 3.1 架构

```
用户消息
  → server agentLoop（新 service，≤8 轮上限）
      ├─ LLM(tools) 决策 → 调系统工具（server 内部函数，直接操作 db，不走 HTTP 自调）
      ├─ 工具结果回喂 → 继续决策
      └─ 终止 → 汇总回复 + 动作轨迹
  → ChatPage：回复气泡 + 动作卡片列表（每步：工具名+参数+结果摘要）+ 「↩ 撤销」按钮
```

### 3.2 工具集设计（按域分期）

**A1 核心工具（首发 10 个，覆盖 80% 场景）**

| 工具 | 说明 | 类型 |
|---|---|---|
| `query_schedule(date/range)` | 查日程/逾期/跟进（读） | 读 |
| `create_task` / `update_task` / `complete_task` | 任务三件套（含挂项目子任务） | 写 |
| `search_documents(q)` / `read_document(id)` | 文档检索读取（FTS） | 读 |
| `create_document(title, content, folder)` | 建文档 | 写 |
| `format_document(id)` | **复用 M16 formatDoc 全文重排** | 写 |
| `update_document(id, patch)` / `move_document(id, folder)` | 改内容/移文件夹（用户的排版例子=format+move 两步链） | 写 |
| `quick_note(text)` | 记 inbox | 写 |

**A2 撤销系统（差异化设计，Codex 都没有的）**
- 每个写工具执行前抓 before 快照存 `agent_actions` 表（tool/params/before/after/ts）
- 动作卡片带「↩ 撤销」→ 逆操作恢复（update 回写 before；create 删除；move 移回）
- 这是"敢让 agent 直接操作系统"的信任基础

**A3 全域扩展**
- 知识库四件（kb_search/kb_create/kb_update/kb_publish）、剪藏两件、报告一件、跟进一件
- **client_actions**：agent 回复可携带前端动作（打开文档页/选中某文档/跳团队页），ChatPage 执行 navigate——"帮我打开那篇文档"闭环

**A4 规划型（远期）**
- 多步复杂任务先出 plan 给用户确认再执行（DSH modes 思路；P1 阶段直执+撤销已够）

### 3.3 用户例子的执行轨迹（验证方案覆盖度）

> "我在别处应急写的文档，格式标题级别很乱，帮我处理好格式放到文档的某个文件夹里"

```
① search_documents(q=最近/关键词)   → 命中目标文档
② read_document(id)               → 确认是散乱的那篇
③ format_document(id)             → M16 formatDoc：LLM 重排标题层级/列表结构
④ move_document(id, folder)       → 匹配/创建目标文件夹并移入
回复："已把《xxx》重排格式（3 个标题层级修正）并移到「文件夹/xxx」[↩撤销] [查看]"
```

> "明天的日程是去洛杉矶" → create_task（明天 ddl 的日程项）或写日历备注 → 动作卡片确认

### 3.4 关键技术点

1. **工具执行走 server 内部函数**（不是 HTTP 自调）——快、原子、可同事务抓 before 快照
2. **function calling 协议**：DeepSeek tools 参数 JSON Schema 逐工具声明；结果以 `role: tool` 回喂
3. **轨迹记录**：每轮（thought/tool_call/result）落 `agent_runs` 表——参考 DSH trajectory，后续可做回放页
4. **轮数上限 8 + 写操作白名单**：防失控；查询类不限
5. **与现有意图动作兼容**：老动作 JSON 视为 create_task 工具的特例，UI 动作卡片样式复用

### 3.5 分期

| 期 | 内容 | 量 |
|---|---|---|
| **A1** | agentLoop service + A1 十工具 + 动作卡片轨迹展示 | 1.5 天 |
| **A2** | agent_actions 快照 + 撤销按钮 | 1 天 |
| **A3** | 知识库/剪藏/报告工具 + client_actions 前端联动 | 1 天 |
| **A4** | plan 确认模式 / 轨迹回放页 | 远期 |

### 3.6 红线

1. **撤销先行**：A2 没做完前，写工具限 A1 十件且避开 delete 类（不做删除工具，删除永远人来）
2. **轮数/预算硬上限**：agent loop ≤8 轮，防 LLM 死循环烧钱
3. **查询不等于操作**：get_schedule 类读工具不弹卡片，写工具必有卡片+撤销
4. 工具实现必须复用现有路由的内部函数，**禁止在 agent 层另写一套数据操作**（WorkOS 教训的变体：两处写逻辑必漂移）

## 4. 参考

- OpenAI/DeepSeek function calling 协议
- DSH trajectory（append-only session log，来源可追溯）
- Codex agent mode（工具化操作系统）
- 本项目 M19 chatAssistant（意图→动作落库，本次升级为其泛化）
