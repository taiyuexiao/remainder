# Notion 功能调研与 Remainder 借鉴建议

> 调研时间：2026-09-23
>
> 目的：从 AI-native 工作台和团队知识协作产品视角，识别 Notion 中 Remainder 尚未具备、或体验明显更强的能力，形成后续产品改造的优先级建议。
>
> 结论先行：最值得借鉴的不是“把 Notion 的所有功能搬过来”，而是四个结构性能力：
>
> 1. 数据库化：同一份数据可以用多种视图、属性、关系和公式组织
> 2. 可复用工作流：模板、按钮、自动化，让用户不必重复搭建流程
> 3. 跨对象/跨应用检索：搜索和 AI 能同时理解页面、数据库、连接器和外部应用
> 4. 协作边界：页面级分享、评论、通知、版本恢复和权限模型

## 1. 调研来源

本次主要依据 Notion 当前官方产品页与 Help Center 入口，重点查看以下主题：

- [Notion Product](https://www.notion.com/product)
- [Notion Help Center](https://www.notion.com/help)
- [Intro to databases](https://www.notion.com/help/intro-to-databases)
- [Relations & rollups](https://www.notion.com/help/relations-and-rollups)
- [Formulas](https://www.notion.com/help/formulas)
- [Database templates](https://www.notion.com/help/database-templates)
- [Tasks & dependencies](https://www.notion.com/help/tasks-and-dependencies)
- [Database views](https://www.notion.com/help/category/database-views)
- [Sharing & collaboration](https://www.notion.com/help/category/sharing-and-collaboration)
- [Automations](https://www.notion.com/help/category/automations)
- [Notion AI](https://www.notion.com/help/category/notion-ai)
- [Notion AI Connectors](https://www.notion.com/help/category/notion-ai-connectors)
- [Custom Agents](https://www.notion.com/help/category/custom-agents)
- [External Agents](https://www.notion.com/help/category/external-agents)
- [Notion Apps](https://www.notion.com/help/category/notion-apps)
- [Developer Platform](https://www.notion.com/help/category/developer-platform)
- [Web Clipper](https://www.notion.com/help/web-clipper)

注意：Notion 部分能力受套餐、工作区类型、地区和逐步发布影响。本文关注的是产品能力和交互模型，不把某个具体套餐权益当作 Remainder 的硬需求。

## 2. 当前对照总览

| 能力 | Notion 的做法 | Remainder 当前状态 | 判断 |
|---|---|---|---|
| 数据库 | 一个数据库中的每条记录都是页面，支持自定义属性、多种视图和多数据源组合 | 任务、文档、知识条目、报告分别建表，字段和页面结构固定 | **结构性差距，P0 借鉴** |
| 视图 | Table / List / Board / Calendar / Timeline / Gallery / Chart / Form 等，可保存过滤、排序、分组 | 有任务树、日历、时间轴、知识库层视图，但视图是硬编码页面 | **P0 借鉴** |
| 关系与 Rollup | 不同数据库可以互相引用，并把关联数据聚合到当前记录 | 项目、任务、文档、知识条目之间有弱关联，但没有通用 relation/rollup | **P0 借鉴** |
| 公式 | 用户可以定义计算属性和函数 | 任务进度、状态等是后端固定计算 | **P1 借鉴** |
| 模板 | 页面模板、数据库模板、模板按钮，可重复生成标准化内容 | 报告有预填模板，文档/项目/知识条目缺少统一模板系统 | **P0 借鉴** |
| 自动化 | 数据库触发器 + 动作，例如字段变化、定时、创建记录后执行动作 | 有提醒扫描和日报定时器，但规则固定，用户不能配置 | **P0 借鉴** |
| 按钮 | 一键插入内容、创建记录、修改属性、执行多步动作 | 编辑器有块操作，但没有面向工作流的 Button 对象 | **P1 借鉴** |
| AI | Notion AI、AI Meeting Notes、Enterprise Search、Custom Agents、External Agents、Connectors | 有 DeepSeek agent loop、工具调用、撤销、计划模式、MCP | **我们已有核心，但缺少跨应用/定时 Agent/会议场景** |
| 搜索 | 全局搜索页面、数据库、工作区和连接器内容，AI 回答带出处 | 文档搜索和知识库搜索分开，缺少统一对象搜索和跨应用检索 | **P0 借鉴** |
| 协作 | 页面分享、权限、评论、@提及、通知、团队空间 | 有团队隔离、角色、知识条目评论和发布/同步；缺页面级权限和实时协作 | **P1 借鉴** |
| 版本 | 页面历史、恢复、活动记录 | 文档有前端版本快照，服务器端完整版本历史和恢复能力较弱 | **P1 借鉴** |
| 发布 | Notion Sites、公开页面、分享链接 | 有内部 `remainder://` 引用和团队发布/同步，没有公开只读发布 | **P1 借鉴** |
| 导入/导出 | 多格式导入、CSV/Markdown/HTML/PDF/打印等导出 | 文档支持 Markdown/TXT/DOCX/PDF 导入和 Markdown 导出 | **P1 借鉴** |
| 开发者平台 | API、Marketplace、Connections、Workers、CLI | 有 REST API 和 MCP server，缺 webhook、SDK、插件/市场模型 | **P2 借鉴** |
| 移动与跨端 | Web、桌面、移动、Calendar、Mail 等产品矩阵 | Tauri 桌面 + Web 构建，暂无移动体验 | **P2，不宜优先复制** |

## 3. 值得优先借鉴的功能

### 3.1 数据库化：从“固定页面”到“可组合对象”

Notion 的核心不只是文档，而是“每条记录都是页面”的数据库模型。一个数据库可以有多个视图，也可以把多个数据源放进同一个视图里。

Remainder 不需要马上做完整 Notion Database，但应逐步引入：

- **统一对象模型**：任务、项目、文档、知识条目、报告都拥有稳定的对象 ID、标题、状态、负责人、日期、标签、来源和关联对象
- **可配置属性**：允许用户增加文本、单选、多选、日期、人员、URL、文件等属性
- **保存视图**：用户可以保存过滤、排序、分组和列显示配置
- **多视图**：同一组数据支持列表、表格、看板、日历、时间轴、卡片
- **跨对象引用**：文档引用任务、任务关联知识条目、报告关联项目

优先从“任务/项目/知识条目”三个对象开始，不要一开始就泛化成任意表单系统。

### 3.2 Relation、Rollup、Formula

这是 Notion 最强的组织能力之一，也是 Remainder 最值得补的结构能力。

推荐渐进实现：

1. 先做 Relation：任务 ↔ 项目、文档 ↔ 项目、知识条目 ↔ 项目、报告 ↔ 项目
2. 再做 Rollup：项目显示子任务完成率、关联文档数、知识条目数、最近更新时间
3. 最后做 Formula：优先级分、剩余天数、风险等级、工作负载等派生字段

Remainder 已经有“项目下子任务进度”这类固定计算，可以把它升级为可解释的 rollup，而不是继续在每个页面手写统计。

### 3.3 模板系统

Notion 的模板不仅是空文档，还包含：

- 页面结构
- 数据库属性默认值
- 关联对象占位符
- 可重复插入的内容块
- 模板按钮

Remainder 最适合先补四类模板：

- 项目启动模板
- 会议记录模板
- 技术 RFC / ADR 模板
- 日报 / 周报 / 月报模板

模板应同时支持：

- 新建文档
- 新建项目
- 新建知识条目
- AI 生成后套用模板

### 3.4 自动化与按钮

Notion 已经把“重复工作”做成可配置流程。Remainder 现有 scheduler 更像系统定时器，不是用户工作流。

建议先做低风险规则：

- 任务到期前 N 天提醒
- 项目进入逾期状态时提醒负责人
- 任务完成时更新项目进度
- 知识条目过期时进入待整理队列
- 文档创建后自动建立版本快照
- 每周五自动生成周报草稿

按钮可以先不做复杂设计器，先做固定动作按钮：

- 创建任务
- 创建子任务
- 沉淀为知识条目
- 移动到项目
- 生成报告
- 发布到团队

### 3.5 统一搜索与 AI 检索

Notion 的 AI 产品叙事已经从“在文档里写作”转向：

- Enterprise Search
- Search across all your apps
- Custom Agents
- Connections

Remainder 当前文档搜索、知识库搜索、任务查询是分散的。建议引入一个统一搜索层：

```text
搜索结果
├── 任务
├── 项目
├── 文档
├── 剪藏
├── 知识条目
├── 报告
└── 会话
```

搜索结果应支持：

- 来源类型过滤
- 团队/项目过滤
- 日期过滤
- 保存搜索
- 在 AI 回答中引用具体对象
- 从搜索结果直接执行动作

这一项会直接强化 Remainder 的 AI-native 体验。

### 3.6 页面级协作与权限

Notion 的分享模型比 Remainder 当前的团队隔离更细。Remainder 现在更接近：

```text
团队 → 成员角色 → 数据可见性
```

Notion 还支持：

```text
页面 → 分享对象 → 评论/查看/编辑 → 通知/提及
```

Remainder 可以先补：

- 文档/知识条目页面级 ACL
- 只读分享链接
- 评论和 @提及
- 评论解决状态
- 评论通知
- 版本恢复

不必马上做多人实时协同编辑；对于本地优先产品，页面级权限、评论和版本恢复的收益更高。

### 3.7 发布、站点与外部分享

Notion Sites 让页面可以发布成网页。Remainder 的团队发布/同步机制已经存在，但主要是“发布给另一个团队节点”。

可以补一条轻量分享链：

```text
文档/知识条目
  → 生成只读分享链接
  → 设置有效期 / 访问码
  → 查看访问记录
```

这比复制 Notion Sites 更符合 Remainder 的本地优先和私有部署定位。

## 4. AI 方面的差距

Remainder 在“本地工具调用 Agent”上并不弱，尤其是：

- 多轮 function calling
- 21 个全域工具
- 动作快照与撤销
- 计划确认模式
- 轨迹回放
- MCP 接入

Notion 更强的地方主要在：

### 4.1 AI Meeting Notes

会议结束直接形成会议纪要、行动项和可搜索知识。

Remainder 可以复用现有报告、任务、知识条目模型，补一个：

```text
会议记录 → AI 摘要 → 行动项 → 任务 → 知识条目
```

### 4.2 Enterprise Search / Connectors

Notion AI 不只搜 Notion，还能连接其他应用。

Remainder 更现实的第一步不是接入大量 SaaS，而是：

- 统一搜索任务、文档、剪藏、知识、报告
- 对接本机文件夹、Git 仓库、MCP 数据源
- 让 AI 回答带对象出处
- 让外部 coding agent 可以通过 MCP 读写 Remainder

### 4.3 Custom Agents / External Agents

Notion 把 Agent 变成可配置、可运行、可共享的自动化单元。

Remainder 可以把现有 `agent_loop` 抽象成：

- 可保存的 Agent 配置
- 定时触发
- 事件触发
- 计划确认
- 运行日志
- 失败重试
- 动作撤销

这比单纯增加聊天工具数量更有价值。

## 5. 不建议照抄的部分

### 5.1 完整的 Notion Database

完整 Database 的属性系统、公式系统、视图系统和多数据源模型很容易变成一个低代码平台。Remainder 当前的任务模型更明确，应该先做“有限数据库化”，不要立刻做任意表。

### 5.2 复杂的多人实时协同

Remainder 的核心是本地优先和主动提醒，不是 Figma/Google Docs 式的实时多人编辑。优先级应放在：

- 页面级权限
- 评论与通知
- 版本恢复
- 发布与同步

而不是先做实时 OT/CRDT 编辑。

### 5.3 完整 Marketplace

Notion Marketplace、Workers、CLI 和插件生态是平台级能力。Remainder 当前规模更适合先做：

- 模板库
- Agent 配置库
- 主题包
- 导入/导出包

之后再考虑插件或外部开发者市场。

## 6. 推荐优先级

| 优先级 | 功能 | 原因 | 建议形态 |
|---|---|---|---|
| P0 | 保存视图 / 过滤 / 排序 / 分组 | 立刻提升任务、知识库和文档的复用能力 | 先覆盖任务、知识条目 |
| P0 | 统一搜索 + AI 出处 | 直接强化 AI-native 主界面 | 全局搜索层 + 结果对象卡片 |
| P0 | 模板系统 | 降低每次创建项目/文档/报告的重复成本 | 四类默认模板 + 用户模板 |
| P0 | 基础 Relation / Rollup | 打通任务、项目、文档、知识条目 | 先做固定关系，不开放任意表 |
| P1 | 自动化规则 | 把固定 scheduler 变成用户可配置工作流 | 提醒、状态、报告、知识 TTL |
| P1 | 页面级权限、评论、版本恢复 | 补齐团队协作基本盘 | 从文档和知识条目开始 |
| P1 | 一键按钮 | 让高频动作成为可复用入口 | 固定动作按钮，不做复杂设计器 |
| P1 | Meeting Notes | 复用现有报告/任务/知识模型 | 会议 → 摘要 → 任务 → 知识 |
| P2 | 公开只读分享 | 支持外部查看，不改变内部真相源 | 分享链接 + 有效期 + 访问码 |
| P2 | Formula | 提升派生指标和风险判断 | 限定函数和字段类型 |
| P2 | 开发者平台 | 面向外部扩展和集成 | webhook / SDK / Agent 配置导出 |

## 7. 对 Remainder 的产品建议

如果目标是打造“AI-native 的个人工作台”，建议把产品演进概括为三步：

### 第一步：让对象可组合

先补统一对象、保存视图、模板、关系和搜索。

### 第二步：让流程可复用

再补自动化、按钮、会议记录、报告生成和 Agent 运行记录。

### 第三步：让工作空间可协作

最后补页面级权限、评论通知、版本恢复、公开分享和开发者扩展。

Remainder 不必成为第二个 Notion。更合理的目标是：

> **拥有 Notion 的组织能力、ChatGPT 的交互入口，以及 Remainder 独有的主动提醒和本地任务模型。**

## 8. 后续落地时需要验证的问题

1. 用户真正需要的是任意数据库，还是更高质量的任务/项目/知识视图？
2. Relation 应该做成显式连接，还是由 AI 自动建议关联？
3. 自动化规则是否需要远程触发，还是只支持本地事件和定时？
4. 页面级权限是否只作用于文档/知识条目，还是也覆盖任务/报告？
5. AI 搜索是否优先做本地跨对象搜索，还是优先接外部连接器？
6. 版本历史放在 SQLite、独立文件，还是 git 镜像里？

