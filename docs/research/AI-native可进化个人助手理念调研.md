# AI-native 可进化个人助手理念调研

> 调研时间：2026-09-23
>
> 调研问题：评价“面向 AI 的个人助手：产品是完整产品，但到用户手里是半成品；用户通过自然语言持续要求个性化组件、工作流和产品形态，云端或本地构建，使产品持续进化”这一理念，并寻找类似理念、产品与技术。
>
> 调研方式：优先使用 GitHub API、官方产品页、官方文档和 arXiv API。Google 搜索页存在反爬和 JavaScript 要求，未把搜索摘要当作主要证据。

## 1. 结论摘要

这个理念的**方向是成立的，而且具有真实产品差异化**，但需要修正一个表达：

> 不要把产品定位成“半成品”，而应定位成“稳定内核 + 可进化个人表面”。

用户需要先信任一个完整、稳定、可恢复的核心产品，然后才有意愿让 AI 改变自己的工作方式。真正有价值的不是让用户面对一个永远没做完的软件，而是：

```text
完整可信的产品内核
+ 可由用户自然语言扩展的能力层
+ 可预览、可撤销、可版本化的进化机制
```

这可以称为：

- **Malleable Software**：可塑软件
- **Generative UI / GenUI**：根据意图生成或重组界面
- **End-User Programming**：终端用户编程
- **Evolving Personal Assistant**：可进化个人助手
- **Personal Software Runtime**：个人软件运行时

从已有产品看，各个组成部分都已经存在，但把它们组合成“长期存在的个人助手实例，其产品形态本身可被用户持续改写”的产品还不多。

## 2. 理念拆解

用户理念实际上包含四个递进层次：

| 层次 | 用户获得的能力 | 例子 |
|---|---|---|
| 个性化 Personalization | 系统根据偏好调整 | 调整排序、主题、推荐 |
| 定制化 Customization | 用户选择已有功能组合 | 自定义侧栏、视图、快捷入口 |
| 共创 Co-creation | 用户用自然语言生成新能力 | “做一个逾期看板”“每天生成日报” |
| 自我进化 Self-evolution | 产品根据使用持续调整自身 | 自动发现重复行为并生成新流程 |

你的理念重点在第 3 层，并向第 4 层延伸。这比传统“设置页个性化”高一个产品层级。

关键命题是：

> 用户不只使用产品，还持续定义产品。

## 3. 客观评价

### 3.1 优点

#### 长尾需求得到覆盖

传统产品只能为大多数用户做功能。个人助手面对的需求非常碎片化：

- 某人想每天整理日报
- 某人想把剪藏自动放进知识库
- 某人想要只看逾期事项的看板
- 某人想要固定的会议记录模板
- 某人想要一个专门管理报销和催办的界面

这些需求不值得每个都做成正式功能，却非常适合由 AI 现场生成。

#### 产品的复利来自“能力积累”

如果用户的修改被沉淀为可复用能力，产品会随使用变得越来越贴合个人：

```text
一次自然语言需求
→ 一个能力包
→ 长期复用
→ 更多使用数据
→ 更好的下一次生成
```

这比单纯聊天记录、提示词收藏或设置项更有复利。

#### 形成平台和生态

能力可以是：

- 个人能力包
- 团队共享能力包
- 官方模板
- 第三方组件
- MCP 工具
- 自动化规则

产品从单一应用演化为个人软件运行时。

#### 本地优先有差异化

云端 prompt-to-app 产品通常把数据和生成都放在云上。Remainder 可以采用：

```text
云端生成 / 编译
+ 本地执行
+ 本地数据
+ 本地版本和撤销
```

这在隐私、离线和个性化方面有独特价值。

### 3.2 风险

#### “半成品”会伤害产品信任

用户不希望每天打开一个还没做完、随时会变样的产品。更稳妥的定位是：

> 核心永远完整，扩展永远开放。

#### 自然语言需求天然有歧义

“帮我整理一下”“做一个合适的界面”“自动处理这些事情”都缺少边界。产品必须支持：

- 意图澄清
- 执行计划
- 变更预览
- 影响范围
- 用户确认
- 失败回滚

#### 生成代码会制造维护债务

用户生成的组件、脚本和工作流会产生：

- 依赖冲突
- 样式不一致
- 数据结构不兼容
- 安全漏洞
- 升级后失效
- 难以排查的错误

这正是 GenUI 和 malleable software 研究中反复出现的问题。

#### “只要能实现”不是产品边界

这句话在研究阶段没问题，但产品需要明确能力边界：

- 哪些数据可以读取
- 哪些动作可以执行
- 哪些组件可以生成
- 哪些代码可以运行
- 哪些修改需要审批
- 哪些行为必须可撤销

#### 生成式产品容易变成“提示词玩具”

如果用户每次都要重新描述需求、重新生成、重新调试，产品体验会很疲劳。生成结果必须沉淀为：

- 可保存能力
- 可编辑配置
- 可复用模板
- 可分享能力包
- 可版本管理
- 可被下一次会话直接调用

## 4. 类似理念与产品

### 4.1 Prompt-to-App：自然语言生成完整应用

这类产品最接近“用户提出需求，系统构建产品形态”：

- [Bolt](https://bolt.new/)：用文字构建网站、应用和原型
- [v0 by Vercel](https://v0.app/)：设计、迭代并扩展全栈 Web 应用
- [Replit Agent](https://replit.com/agent)：从自然语言构建并发布应用
- [Anything / Create.xyz](https://www.create.xyz/)：把想法变成网站、应用和工具
- [Rork](https://rork.com/)：用 AI 创建 iOS、Android 和 Web 应用
- [Lovable](https://lovable.dev/)：对话式生成软件产品
- [GPT Engineer](https://github.com/AntonOsika/gpt-engineer)：代码生成实验项目，后来影响了 Lovable 这类产品

相似点：

- 自然语言作为主要输入
- 自动生成界面、数据和应用代码
- 用户持续修改产品

差异点：

- 这些产品通常每次生成一个新应用或项目
- 它们不一定是长期运行的个人助手
- 它们较少解决“用户已有数据、已有工作流、已有产品实例持续进化”
- 生成结果的长期维护和升级仍是痛点

判断：

> 这是你的理念的重要技术来源，但不是完整答案。Remainder 的目标不应只是“给自己生成一个应用”，而是“让自己的助手不断长出新能力”。

### 4.2 Agent / Workflow 平台：把重复工作变成可配置自动化

- [Dify](https://github.com/langgenius/dify)：Agent、工作流、RAG、插件和应用发布平台
- [Flowise](https://github.com/FlowiseAI/Flowise)：可视化构建 AI Agent 和工作流
- [n8n](https://github.com/n8n-io/n8n)：可视化工作流自动化，支持 AI 节点、代码节点和大量集成
- [Dust](https://dust.tt/)：基于组织知识和工具创建可共享 Agent
- [Lindy](https://www.lindy.ai/)：AI teammate / agent 自动化
- [Gumloop](https://www.gumloop.com/)：让业务人员构建 AI agents
- [Relevance AI](https://relevanceai.com/)：面向销售、客服、营销等场景的 specialist agents
- [Zapier AI](https://zapier.com/ai)：把 AI 放进工作流、Agent 和客户聊天
- [Notion Custom Agents](https://www.notion.com/product/agents)：在工作区内自动处理重复任务

相似点：

- 自然语言或低代码配置生成工作流
- 可调用外部工具和数据
- 适合长尾自动化需求
- 有 Agent 运行、审批和监控需求

差异点：

- 大多数平台偏企业工作流或集成自动化
- 用户仍需要理解节点、触发器、工具、连接器
- 不一定改变产品界面和信息架构
- 不一定把生成结果沉淀为个人产品的组成部分

判断：

> 你比它们更进一步：不只编排工作流，还要让用户改变产品形态。但初期应先借鉴它们的“能力包、触发器、工具调用、运行日志”。

### 4.3 Generative UI / 可塑界面研究

这是理论上最接近你理念的方向。

- [Gradual Generation of User Interfaces as a Design Method for Malleable Software](https://arxiv.org/abs/2601.17975)：提出让 AI 分阶段生成界面，用户可以回退到不同定制层次
- [Hidden Technical Debt in Generative (GenUI) and Malleable User Interfaces](https://arxiv.org/abs/2604.16354)：指出数据格式、安全协议、用户认知能力和评估方法都是 GenUI 的隐性债务
- [CopilotKit](https://github.com/CopilotKit/CopilotKit)：Agent 与 Generative UI 前端框架
- [OpenGenerativeUI](https://github.com/CopilotKit/OpenGenerativeUI)：开源 Generative UI 框架
- [OpenUI](https://github.com/thesysdev/openui)：Generative UI 开放标准
- [Vercel AI SDK](https://github.com/vercel/ai)：AI 应用和 Generative UI 开发工具
- [ToolJet](https://github.com/ToolJet/ToolJet)：AI 企业应用生成、内部工具和工作流平台

相似点：

- 界面不是完全静态的
- 用户意图可以生成或重组 UI
- 关注“可发现的定制”而不是无限自由的空白框

差异点：

- 研究成果和框架还不等于成熟消费级产品
- 生成 UI 的可维护性、数据适配、安全和评测仍未完全解决

判断：

> 这是你的理念最应该重点跟踪的方向。尤其要注意“渐进式生成 UI”：不要一次性生成一个完全陌生的界面，而是逐步暴露定制层级，并允许回退。

### 4.4 Agent Skills / MCP：让助手能力可扩展

- [Model Context Protocol](https://github.com/modelcontextprotocol/modelcontextprotocol)：AI 应用连接外部数据、工具和工作流的开放协议
- [Claude Agent Skills](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)：把指令、脚本、模板和资源封装为可复用能力
- [OpenAI Codex Skills](https://learn.chatgpt.com/docs/build-skills)：为 Codex / ChatGPT 添加能力和专业知识
- [Apple App Intents](https://developer.apple.com/documentation/appintents)：让应用内容和动作可被 Siri、Shortcuts、Spotlight 和 Widget 发现

相似点：

- 助手不是固定工具集，而是可以加载能力
- 工具、脚本、模板和外部系统可以组合
- 能力可以被发现、调用和复用

差异点：

- Skills / MCP 主要扩展 Agent 的工具和知识
- 不直接负责生成产品界面和完整产品形态
- 能力安装、升级、权限和撤销机制仍需要产品自己补

判断：

> Remainder 应该把“能力包”作为一等公民。它可以包含工具、视图、组件、模板、自动化规则和 Agent 配置，而不只是提示词。

### 4.5 End-User Programming / 自然语言编程

- [Will Code Remain a Relevant User Interface for End-User Programming with Generative AI Models?](https://arxiv.org/abs/2311.00382)：讨论自然语言生成是否会改变终端用户编程
- [AIOS Compiler](https://arxiv.org/abs/2405.06907)：把自然语言、伪代码和流程编程统一成 Agent 程序表示
- [ProgramAlly](https://arxiv.org/abs/2408.10499)：盲人用户通过方块、自然语言和示例编程创建个性化视觉辅助程序
- [Goal-Oriented End-User Programming of Robots](https://arxiv.org/abs/2403.13988)：让用户表达目标，由规划器补足细节，并通过 Plan Visualizer 降低失控
- [Direct Manipulation and Natural Language Programming, Together at Last?](https://arxiv.org/abs/2608.26359)：把自然语言编辑和直接操作编辑统一到结构化编辑接口

相似点：

- 用户不需要掌握传统编程语言
- 用户描述目标，系统补齐实现
- 强调用户控制、可解释计划和预览

差异点：

- 这些研究多为特定领域或原型系统
- 还没有形成统一的消费级“个人软件进化平台”

判断：

> 研究方向与你的理念高度一致。特别是“计划可视化”和“结构化编辑”值得借鉴：生成不能只有结果，还要让用户看见并理解变化。

### 4.6 自修改软件 / Coding Agents

- [OpenHands](https://github.com/OpenHands/OpenHands)：AI 驱动的开发 Agent
- [Cline](https://github.com/cline/cline)：自主 Coding Agent
- [SWE-agent](https://github.com/SWE-agent/SWE-agent)：根据 issue 自动修复代码
- [Aider](https://github.com/Aider-AI/aider)：终端 AI 结对编程

相似点：

- Agent 可以理解需求并修改代码
- 可以形成持续迭代循环
- 可以自动生成、测试和修复

差异点：

- 这些产品的默认对象是代码仓库，不是普通用户的个人应用
- 需要开发者式的版本、测试、构建和发布流程
- 直接让它们修改运行中的个人软件风险很高

判断：

> 可以借鉴其“计划—修改—测试—提交—回滚”循环，但不应默认允许 Agent 直接改 Remainder 内核代码。

## 5. 与现有产品相比，你的理念真正不同的地方

真正有差异的不是下面任何单独一项：

- 自然语言生成 UI
- Agent 调用工具
- 工作流自动化
- 插件系统
- 个性化推荐

而是它们的组合：

```text
长期存在的个人助手
+ 稳定的数据与任务内核
+ 自然语言生成产品能力
+ 生成 UI / 组件 / 工作流
+ 本地执行与隐私
+ 能力版本、审批、撤销和分享
```

目前市场上较常见的是：

```text
“生成一个新应用”
或
“编排一条自动化”
或
“给 Agent 加一个工具”
```

你的目标是：

```text
“让同一个个人助手持续长成用户自己的产品”
```

这是有差异化的。

## 6. 推荐的产品定义

不建议把口号写成：

> 我们交付的是半成品。

建议改成：

> **我们交付一个完整可靠的个人工作内核，同时开放一个可以由你持续定义的产品能力层。**

或者更产品化地说：

> **Remainder 不是固定功能清单，而是一个会长出个人能力的 AI 工作台。**

### 产品三层模型

```text
稳定内核
├── 身份与权限
├── 数据与同步
├── 任务/文档/知识对象
├── 搜索与索引
├── 安全、审计、备份、恢复

能力层
├── 组件 / Widget
├── 视图 / Dashboard
├── 模板
├── 工具 / Action
├── 自动化规则
├── Agent 配置
├── MCP / 外部连接器

进化层
├── 自然语言需求
├── 意图解析
├── 变更计划
├── 预览与模拟
├── 用户确认
├── 沙箱安装
├── 版本、diff、回滚
├── 使用反馈与二次修改
```

## 7. 推荐的技术路径

### 7.1 先做“能力包”，不要先做任意代码生成

一个能力包可以是：

```yaml
name: overdue-dashboard
kind: view
inputs:
  - task_status
  - task_ddl
render:
  type: board
actions:
  - complete_task
  - reschedule_task
permissions:
  - read:tasks
  - write:tasks
```

初期能力包应支持：

- 保存视图
- 自定义 Widget
- 自动化规则
- 文档/任务模板
- 自定义动作
- 自定义 Agent 工作流

### 7.2 自然语言先编译成规格，不要直接编译成任意代码

推荐链路：

```text
用户自然语言
→ Intent Spec（结构化意图）
→ Change Plan（变更计划）
→ Preview（界面/行为预览）
→ Approval（用户确认）
→ Capability Package（能力包）
→ Sandbox Runtime（沙箱运行）
→ Version + Audit + Rollback
```

### 7.3 云端生成，本地运行

推荐混合模式：

- 云端负责意图理解、组件生成、代码生成、测试生成
- 本地负责数据读写、权限执行、安装和运行
- 简单配置优先走本地 DSL
- 新组件可以生成受限 React/WebView 组件
- 任意脚本必须签名、声明权限、限制网络和文件访问
- 本地始终有离线模板和确定性 fallback

### 7.4 变更必须像 Git 一样可追踪

每次用户需求产生：

- capability ID
- version
- prompt / intent
- generated spec
- permission manifest
- preview snapshot
- test result
- installed time
- rollback point

否则用户会失去控制，团队也无法支持。

### 7.5 用“渐进式生成 UI”降低陌生感

借鉴 arXiv 2601.17975 的思路：

1. 先给用户默认界面
2. 根据意图暴露一个可定制维度
3. 用户选择后再展开下一层
4. 每一步都可回退

不要一次性把用户丢进一个完全由 AI 生成的陌生界面。

## 8. Remainder 的落地建议

### 第一阶段：可复用工作能力

先支持用户用自然语言生成：

- 保存视图
- 今日/逾期/跟进 Widget
- 自动化规则
- 文档、项目、会议模板
- 自定义动作按钮
- 定时报告

例子：

```text
“每天下班前把今天完成的任务整理成日报并发邮件”
“给我一个只看逾期任务的看板”
“文档创建后自动做错别字检查”
“剪藏技术文章时自动放进 backend 频道”
```

### 第二阶段：可生成小组件和页面

允许生成：

- Dashboard
- 个人首页布局
- 项目状态卡
- 报告卡片
- 周期性复盘面板

### 第三阶段：完整个人软件进化

允许：

- 多能力包组合
- 能力包分享和导入
- 本地/云端构建器
- 自动生成测试
- 跨设备能力同步
- 根据使用模式主动建议新能力

## 9. 需要警惕的反例

- Relay.ai / Relay.app 曾提供 AI workflow 产品，但 2026 年 9 月已经停止服务并删除账户和运行记录。这提醒我们：如果产品把用户的能力、工作流和运行历史都绑定在云端，平台关闭会造成严重损失。Remainder 的能力包、运行记录和用户数据应优先本地可导出。
- Prompt-to-app 产品容易出现“第一次惊艳，第三次难维护”的问题。生成一次 UI 不难，难的是三个月后还能升级、调试和复用。
- Agent 平台容易变成“节点画布专家工具”。如果用户需要理解 trigger、node、connector、tool schema，就违背了自然语言优先的初心。

## 10. 总体评分

| 维度 | 评价 | 说明 |
|---|---|---|
| 战略方向 | 8.5/10 | 与 AI-native、个人化、长尾需求高度吻合 |
| 理念新颖度 | 7/10 | 单点技术已有较多实践，组合定位仍有差异化 |
| 用户价值 | 9/10 | 如果稳定可用，会显著提升长期黏性 |
| 原型可行性 | 8/10 | 现有 LLM、MCP、沙箱、组件和 Agent 技术足以做 MVP |
| 产品化难度 | 8.5/10 | 难点在安全、升级、可维护性和用户控制 |
| 平台潜力 | 8.5/10 | 能力包、模板、组件和 Agent 可以形成生态 |
| 最大风险 | 8/10 | 生成能力失控、版本债务、用户失去信任 |

最终判断：

> **理念值得做，但成功条件不是“能不能生成”，而是“生成之后能不能稳定地拥有、理解、修改、撤销和升级”。**

