# Remainder

> 本地优先的个人任务规划与团队协作知识平台：任务提醒 + 飞书级云文档 + 网页剪藏 + 调研画布 + AI 助手 + 桌面宠物 + **多团队知识库（含 coding agent 的 MCP 接入）**。
> Windows / macOS 桌面应用（Tauri 2），数据全部本地 SQLite，可选局域网团队联机。

---

## 功能总览

### 📋 任务与日程

- **任务四层模型**：主线 / 支线 / 跟进 / 想法；项目 → 子任务两级结构（项目可设 ddl、里程碑、标签）
- **今日视图**：今日到期 + 逾期 + 今日待跟进一屏聚合
- **日历视图**、**全部任务**（项目树 + 拖拽排序）
- **跟进管理**：@人 + 下次跟进日期，逾期脉动提醒，一键催促计数
- **🗺 全景时间轴**：项目泳道甘特图（渐变进度条 / ddl◆ / 跟进◆ / 今日红线 / 负载热图 / 未排期 chips / 周月季缩放 / 全屏模式）
- **提醒通知**：ddl 到点系统通知（Tauri notification）
- **📊 报告**：日报 / 周报 / 月报自动生成（LLM 总结），支持 SMTP 邮件定时发送，日报含「今日知识库动态」

### 📝 文档（飞书云文档级编辑器）

基于 Tiptap 2 深度定制，UI 与交互全面对齐飞书：

- **版式**：800px 居中正文（可切宽版 1120px）、16px/1.7 行高、40px 文档标题、飞书蓝 #3370FF 配色体系
- **常驻 40px 工具栏**：撤销/重做、样式（正文~九级标题渐进解锁）、字体、字号、B/I/U/S、行内代码、颜色（字色+底色合并面板）、链接、对齐、列表、任务、引用、代码块、分割线、高亮块、图片、表格
- **斜杠菜单**（行首或空格后 `/`）：AI 帮我写置顶、基础/常用分组、中英文拼音过滤
- **浮动工具栏**：选中弹出（问问AI / 解释 / 文本样式 / B I U S / 颜色 / 链接 / 缩进 / 评论）
- **块操作**：行首 [T]+[⋮⋮] 把手、拖拽移动（蓝色指示线）、块菜单（转换/上移/下移/复制/删除）、Esc 选块、Tab 缩进
- **富内容**：表格（列宽拖拽/单元格背景/对齐/表头）、代码块语法高亮（lowlight）、KaTeX 公式（块级+行内）、Callout 高亮块、分栏、@提及、日期胶囊、图片（缩放/对齐/题注）
- **中文 Markdown 即时转换** + Markdown 粘贴自动成块 + **表格文本粘贴自动转表格**（Tab/空格/管道分列识别）
- **大纲侧栏**、**⌘F 查找替换**、**版本快照**（自动去重，上限 50）、**划线评论**、阅读/编辑模式
- **AI**：右侧 AI 侧栏多轮流式对话（问问AI/解释/续写/润色）、一键排版、**错别字批处理**（扫描→清单→应用选中/全部）
- **文档管理**：嵌套文件夹树（拖拽移动）、全文搜索（FTS5 trigram 中文分词）、导出 Markdown / 打印 PDF、文档导入（md/txt/docx/pdf）

### 📥 剪藏

- **浏览器扩展**（MV3，Edge/Chrome）：一键剪藏网页正文（自动清洗 + 图片本地化）
- **剪贴板剪藏**：速记窗 Alt+C 抓取 CF_HTML 富文本
- 剪藏箱 → 一键转文档，或沉淀到知识库

### 💡 Inbox 速记

- 全局速记窗（置顶小窗，可拖动/放大/拉伸）
- 想法快速收集 → 转任务/项目

### 🎨 调研画布

- 无限画布（按住拖动平移 + 背景视差）
- 卡片：文本 / 图片 / 剪藏引用；右下角拉伸调尺寸；卡片内富文本编辑（字体/字号/B/I/颜色/高亮）

### 🤖 AI 助手

- GPT 式对话页（会话历史 + 主对话区）
- **自然语言建任务**："明天下午5点交周报" → 自动识别意图落库（挂现有项目子任务/新建项目/跟进/想法）
- 文档导入（md/txt/docx/pdf）自动入库

### 🐾 桌面宠物

- **双渲染引擎**：sprite 像素条带引擎（48 帧动画）/ **Live2D**（Cubism 4 + Cubism 2 双运行时）
- 内置 **Hiyori** 模型（仓库自带，开箱即用）；支持自放模型包（`server/data/live2d-models/`）
- 桌宠对话（人格化 petChat，自动检索知识库做轻量 RAG）
- 跳跃/转圈/害羞/视线跟随等交互

### 👥 团队知识平台（核心差异化）

局域网团队节点 + 多团队空间 + coding agent MCP 接入：

- **团队空间**：主导航「👥 团队」三栏布局——团队列表（多团队切换）→ 二级菜单 → 内容区
  - 多团队**权限隔离**（team_id + 成员校验集中在 server 一处）；角色 owner/admin/member
  - 8 位邀请码入团、成员管理、邀请码轮换
  - 身份：LAN 信任制（「我的名字」同名即同人）
- **四层知识模型**：
  - ⚡ **快讯**：AI 新闻/福利/工具更新，TTL 过期自动沉底
  - 💬 **探讨**：提问 → 讨论 → 结论回填，一键沉淀为经验/决策
  - 📚 **经验**：笔记/踩坑/好文分享（频道 + 标签）
  - 📐 **工作库**：**项目 → 子项目 → 条目**三层树（规范/接口契约/架构决策）
- **@人必达**：条目/项目 @负责人 → P0 通知；评论 @人 → 必达
- **评论流**：条目级评论 + 楼中楼回复
- **发布/同步**（fork 式）：发布 ≠ 复制——发布 = 给目标团队可见权 + 进对方收件箱；对方三选（仅查看 / 同步副本 / 忽略）；副本记 upstream 指针，上游更新一键拉新；**上游删除不回删副本**
- **有用 ★**、TTL 保质期、FTS5 全文搜索
- **OKF 导出**：一键导出 Google OKF v0.2 标准知识包（markdown + YAML frontmatter，任何 agent 可直接读）
- **草稿闭环**：agent 提交草稿 → 人确认转正

### 🔌 MCP Server（给 coding agent 用）

`server/mcp-server`（stdio，@modelcontextprotocol/sdk），6 个工具：

| 工具 | 作用 |
|---|---|
| `kb_search(query, type?, channel?, team?)` | 全文检索知识库 |
| `kb_get(id)` | 取条目全文（含评论摘要） |
| `kb_list_recent(channel?, days?, team?)` | 最近 N 天新条目 |
| `kb_constraints(module, team?)` | **干活前必查**：聚合该模块 spec + adr 否决项（adr 置顶） |
| `kb_who_knows(topic, team?)` | 按 owners/作者分布回答"这事问谁" |
| `kb_submit_draft(type, title, content, ...)` | agent 踩坑沉淀为草稿，待人确认 |

接入示例（Claude Code）：

```bash
claude mcp add remainder-kb -- node "C:/projects/remainder/server/mcp-server/index.mjs"
```

环境变量：`REMAINDER_API`（默认 `http://127.0.0.1:3210`）、`REMAINDER_TOKEN`（联机 token）、`REMAINDER_USER`（你的团队身份名）、`REMAINDER_TEAM`（默认团队，缺省 personal）

### 🌐 联机共享

- 节点侧：`HOST=0.0.0.0 TEAM_TOKEN=<共享token> node server/dist/index.js`
- 成员侧：设置 → 联机共享 → 填节点地址 + token + 我的名字 → 重启
- 非回环请求强制 `x-team-token` 校验；CORS 已配置

---

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面壳 | Tauri 2（Rust），单实例插件，桌面小组件窗口 |
| 前端 | React 18 + Vite 6 + Tailwind CSS 4 + Tiptap 2.11（编辑器） |
| 后端 | Fastify 5 + better-sqlite3（WAL）+ FTS5 trigram 中文全文索引 |
| LLM | DeepSeek（OpenAI 兼容协议，server 侧代理，key 不出后端），SSE 流式 |
| 桌宠 | pixi.js 6 + pixi-live2d-display（Cubism 4/2 双运行时） |
| 扩展 | Manifest V3（Edge/Chrome） |
| 分发 | Windows 便携 zip / macOS .app（GitHub Actions 双平台构建） |

## 目录结构

```
├── desktop/            # Tauri 桌面端
│   ├── src/pages/      # 页面（任务/日历/全景/文档/团队/画布/AI助手/桌宠…）
│   ├── src/editor2/    # 飞书级文档编辑器内核
│   └── src-tauri/      # Rust 壳（单实例/小组件/剪贴板）
├── server/             # Fastify 后端
│   ├── src/routes/     # tasks/projects/documents/clips/knowledge/teams/comments/publications…
│   ├── src/db/         # SQLite schema（user_version 递增迁移，当前 v15）
│   ├── src/llm/        # DeepSeek 代理（chat/排版/错别字/总结/流式）
│   ├── mcp-server/     # 知识库 MCP server（6 工具）
│   └── verify-m*.ps1   # 各里程碑端到端验证脚本
├── clipper/            # 网页剪藏浏览器扩展（MV3）
├── packaging/          # 启动脚本 + 内置 Hiyori Live2D 模型
├── docs/
│   ├── modules/        # 里程碑文档（M1~M29，含报错及解决方案表）
│   └── research/       # 调研文档（团队协作方案 v1-v3、飞书对齐方案…）
└── 启动Remainder.bat   # 一键启动（server + 桌面端）
```

## 快速开始

### 方式 A：下载构建产物（推荐）

GitHub Actions → `release` 工作流手动触发 → 下载 `remainder-win-x64.zip` / `remainder-mac-arm64.zip`，解压即用。

### 方式 B：源码构建

前置：Node 22+、pnpm、Rust toolchain（Tauri 构建需要）

```bash
git clone https://github.com/taiyuexiao/remainder.git
cd remainder
pnpm install

# 配置 LLM（AI 功能需要；不配也能用，只是没有 AI）
cp server/.env.example server/.env
# 编辑 server/.env 填入 LLM_API_KEY（DeepSeek）

pnpm --filter server build
pnpm --filter desktop tauri build --no-bundle   # 产出 desktop/src-tauri/target/release/remainder.exe

# 启动（Windows）
启动Remainder.bat
```

首次启动自动建库（`server/data/remainder.db`，schema 迁移到 v15）并挂载内置 Hiyori 桌宠模型。

### 浏览器扩展安装

Edge/Chrome → 扩展管理 → 开发者模式 → 加载解压缩的扩展 → 选 `clipper/` 目录。

## 配置项（server/.env）

| 变量 | 说明 |
|---|---|
| `PORT` | 后端端口（默认 3210） |
| `HOST` | 监听地址（默认 127.0.0.1；联机设 0.0.0.0） |
| `TEAM_TOKEN` | 联机共享 token（非回环监听时必填） |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | LLM 接入（默认 DeepSeek） |
| `LLM_ENABLED` | `true` 启用 AI 功能 |
| `SMTP_USER` / `SMTP_PASS` / `REPORT_TO` / `REPORT_TIME` | 邮件日报（可选） |

## 开发

```bash
pnpm --filter server dev      # 后端热更（tsx watch）
pnpm --filter desktop dev     # 前端 Vite dev（1420）
pnpm --filter desktop build   # 前端构建
pnpm --filter server build    # 后端构建（tsc）
```

- 里程碑验证：`server/verify-m23.ps1` ~ `verify-m28.ps1`（需先起对应 PORT 实例，PowerShell 执行）
- 项目约定与踩坑录：根目录 `AGENTS.md`（AI 协作代理必读）
- 里程碑文档：`docs/modules/`（每个 M 都有实现清单 + 报错及解决方案表）

## 数据与隐私

- 全部数据本地：`server/data/remainder.db`（SQLite WAL）
- LLM key 只在 server 侧，前端/桌宠/MCP 全部走后端代理
- 联机模式仅局域网 + 共享 token，无云端账号体系
- Live2D 模型：Hiyori 为官方示例模型（随仓分发）；其他模型请自备并遵守对应版权要求

## License

个人项目，源码仅供参考学习。
