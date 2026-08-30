# Remainder 技术文档（TECH）

> 版本：v1.0 ｜ 状态：待确认 ｜ 最后更新：2026-08-28

## 1. 总体架构

```
┌─────────────────────────────────────────────┐
│  桌面端 (Tauri 2)        Web 端 (浏览器)      │
│  ├─ 主窗口 (React)        同一套 React 代码    │
│  ├─ 桌面小组件 (React)                        │
│  ├─ 速记窗 (React)                            │
│  └─ 桌宠窗 (React, v3)                        │
└──────────────┬──────────────────────────────┘
               │ HTTP REST /api/*
┌──────────────▼──────────────────────────────┐
│  后端服务 (Node.js + Fastify + TypeScript)    │
│  ├─ routes/    REST API                      │
│  ├─ db/        SQLite (better-sqlite3)       │
│  ├─ scheduler/ 本地定时器（提醒+日报）         │
│  ├─ mailer/    Nodemailer → 163 SMTP         │
│  └─ llm/       DeepSeek (OpenAI 兼容)        │
└──────────────┬──────────────────────────────┘
               │
        SQLite 文件 (本地唯一数据源)
```

**核心原则**：API 优先。桌面端、Web 端、定时器全部走同一 REST API → 后端可原样部署到任意服务器（阿里云/火山/自有），前端只改 API base URL。

## 2. 技术选型

| 层 | 选型 | 理由 |
|----|------|------|
| 桌面壳 | **Tauri 2** | 安装包 ~10MB、内存低；透明无边框窗、全局热键、系统通知原生支持（vs Electron 包大 10 倍） |
| 前端 | React 18 + TypeScript + Vite + Tailwind CSS | 生态最大；Web 端零改动复用 |
| 后端 | Node.js + Fastify + TypeScript | 与前端同语言；Fastify 轻量高性能 |
| 剪藏解析 | defuddle/node + linkedom + sanitize-html | 正文提取 + DOM 遍历（图片本地化）+ 白名单清洗，无头纯 JS 栈 |
| 数据库 | SQLite（better-sqlite3） | 单用户本地零运维；同步 API 换 Postgres 仅需换驱动层 |
| 块编辑器 | **Tiptap**（v2 引入） | MIT、React 兼容、生态最大，块编辑能力最接近飞书 |
| 邮件 | Nodemailer → smtp.163.com:465 (SSL) | 163 授权码发信，日发 ≤50 封足够 |
| LLM | DeepSeek（OpenAI 兼容接口） | 国内直连、便宜；base_url/model 可配置换任何兼容供应商 |
| 桌宠 | 2D 精灵图序列帧（v3） | license 干净、与 React 栈契合；Live2D 有 license 红线留二期 |

## 3. 项目结构（pnpm monorepo）

```
remainder/
├── docs/                    # SDD 文档
│   ├── PRD.md  TECH.md  TEMPLATE.md
│   └── modules/             # 功能点文档 Mx.y-*.md
├── server/                  # 后端
│   ├── src/
│   │   ├── index.ts         # Fastify 入口
│   │   ├── config.ts        # .env 配置加载
│   │   ├── db/              # 连接 + 建表迁移
│   │   ├── routes/          # tasks / follow-ups / inbox / documents / settings
│   │   ├── scheduler/       # 定时器（提醒扫描、日报）
│   │   ├── mailer/          # SMTP 发信
│   │   └── llm/             # DeepSeek 客户端
│   └── data/                # remainder.db (gitignore)
├── desktop/                 # Tauri + React
│   ├── src/                 # React 应用（窗口共用的组件库）
│   │   ├── windows/         # main / widget / quick-capture / pet 各窗口入口
│   │   ├── components/  api/  stores/
│   └── src-tauri/           # Rust 侧：窗口创建、全局热键、通知、点击穿透
└── pnpm-workspace.yaml
```

## 4. 数据模型（SQLite DDL）

> M10 起为「项目文件夹」两层模型（user_version=2 迁移，详见 docs/modules/M10.1-项目模型与迁移.md）：
> main/side/follow 是**项目**（projects 表），tasks 表只剩**子任务 + 平铺想法（idea）**。

```sql
CREATE TABLE projects (           -- 项目文件夹（M10）
  id TEXT PRIMARY KEY,            -- uuid（迁移时保留原任务 id）
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('main','side','follow')),
  status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','doing','done','archived')),
  priority INTEGER DEFAULT 2,     -- 1高 2中 3低
  ddl TEXT,                       -- ISO 日期时间，可空
  milestone TEXT,                 -- 主线项目里程碑，可空
  tags TEXT DEFAULT '',           -- 逗号分隔
  note TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  done_at TEXT
);

CREATE TABLE tasks (              -- 子任务 / 平铺想法
  id TEXT PRIMARY KEY,            -- uuid
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('main','side','follow','idea')), -- 子任务从项目继承；idea 为平铺想法
  status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','doing','done','archived')),
  priority INTEGER DEFAULT 2,
  ddl TEXT,
  milestone TEXT,
  tags TEXT DEFAULT '',
  note TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  done_at TEXT,
  reminded_at TEXT,
  project_id TEXT                 -- 所属项目；idea 为 NULL 平铺。删项目不删子任务：置 NULL 且 type→'idea'
);

CREATE TABLE follow_ups (         -- 跟进型项目的催办信息（1:1，M10 起挂项目级）
  task_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE, -- 列名沿用，实指项目 id
  person TEXT NOT NULL,           -- 被催人
  next_follow_date TEXT NOT NULL, -- 下次跟进日期
  urge_count INTEGER DEFAULT 0,   -- 已催次数
  last_urged_at TEXT
);

CREATE TABLE inbox (              -- 速记（idea 的暂存区）
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  tags TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  converted_task_id TEXT          -- 转任务后回填
);

CREATE TABLE documents (          -- v2 智能文档 / M11.4 知识库（user_version=4）
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',        -- Tiptap JSON（剪藏转入的为 sanitize 后 HTML）
  content_text TEXT DEFAULT '',   -- 正文纯文本（应用层维护，FTS 索引用）
  source_url TEXT DEFAULT '',     -- 剪藏来源链接
  tags TEXT DEFAULT '',           -- 逗号分隔
  summary TEXT DEFAULT '',        -- 摘要（剪藏转入时 = clip.excerpt）
  clip_id TEXT,                   -- 来源剪藏 id
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- FTS5 全文搜索（M11.4）：external content 关联 documents.rowid，
-- trigram 分词（CJK 友好）；文档增删改/剪藏转入后全量 rebuild 同步
CREATE VIRTUAL TABLE docs_fts USING fts5(
  title, content_text, tags,
  content='documents', content_rowid='rowid',
  tokenize='trigram'
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE clips (              -- 网页剪藏箱（M11.1，user_version=3）
  id TEXT PRIMARY KEY,
  url TEXT DEFAULT '',
  title TEXT NOT NULL,
  content_html TEXT NOT NULL,     -- 清洗+图片本地化后的正文
  excerpt TEXT DEFAULT '',        -- 纯文本前 200 字
  source TEXT DEFAULT 'extension',-- extension | clipboard
  status TEXT DEFAULT 'inbox' CHECK(status IN ('inbox','converted')),
  converted_doc_id TEXT,
  created_at TEXT NOT NULL
);
-- 图片存 server/data/clip_images/<uuid>.<ext>，src 重写为 /api/clips/images/<file>
```

## 5. REST API 设计

```
GET    /api/health
GET    /api/projects?type=&status=           # 项目列表，带 done_count/total_count + follow 字段
POST   /api/projects                         # follow 型必填 person+nextFollowDate
PATCH  /api/projects/:id                     # 含 follow 字段 upsert（与现有行合并）
DELETE /api/projects/:id                     # 不删子任务：子任务落 idea
POST   /api/projects/:id/done
GET    /api/tasks?projectId=&type=&status=&date=  # 子任务+想法，带 project_name
POST   /api/tasks                            # 传 projectId=子任务（type 继承）；不传只能 type='idea'
PATCH  /api/tasks/:id
DELETE /api/tasks/:id
POST   /api/tasks/:id/done
GET    /api/tasks/today                      # { overdue, today(子任务+idea 带 project_name), followUps(follow 型项目) }
POST   /api/follow-ups/:taskId/urge          # 一键再催（taskId=项目 id）：urge_count+1, last_urged_at=now
PATCH  /api/follow-ups/:taskId               # 改被催人/下次跟进日（taskId=项目 id）
GET    /api/inbox    POST /api/inbox    DELETE /api/inbox/:id
POST   /api/inbox/:id/convert                # body.projectId=进已有项目为子任务；否则按 type 新建项目/平铺 idea
GET    /api/documents  POST/PATCH/DELETE     # 文档（PATCH 支持 tags/source_url/summary）
GET    /api/documents/search?q=              # 全文搜索：q>=3 字 FTS5 trigram（bm25 rank），<3 字 LIKE 兜底；返轻行
GET    /api/settings   PUT /api/settings/:key
POST   /api/report/daily/send                # 手动触发日报（调试用）
POST   /api/llm/summary                      # LLM 生成总结（body 带上下文）
POST   /api/clips                            # 网页剪藏入库 {html,url?,title?,source?}，走 defuddle+sanitize+图片本地化管线
GET    /api/clips                            # 剪藏箱列表（轻行无 content_html，inbox 优先）
GET    /api/clips/:id                        # 单条详情（含正文）
DELETE /api/clips/:id
POST   /api/clips/:id/convert                # 一键转 documents，重复转 409
GET    /api/clips/images/:file               # 本地化图片服务（basename 防穿越）
# 注：Fastify bodyLimit 全局 50MB（剪藏 HTML 可达数 MB）
```

## 6. 关键实现要点

### 6.1 Tauri 窗口
- **桌面小组件**：`transparent: true, decorations: false, alwaysOnTop: false, skipTaskbar: true`，桌面层常驻；`set_ignore_cursor_events` 整窗穿透开关（M3 先做整窗，区域级穿透见风险节）
- **速记窗**：全局热键 `Ctrl+Shift+Space`（`tauri-plugin-global-shortcut`），唤起居中窗口，Esc 隐藏
- **系统通知**：`tauri-plugin-notification`，由前端收到后端 SSE/轮询的到点事件后触发（或 Rust 侧定时）
- **桌宠窗**（v3）：独立透明窗 + CSS sprite/canvas 序列帧

### 6.1.1 剪贴板剪藏通道（M11.3）
- Rust 侧 `clipboard-rs`（0.3）：`ClipboardContext::get_html()` 读 Windows CF_HTML；`read_clipboard_html` Tauri command 截取 `<!--StartFragment-->`~`<!--EndFragment-->` 的 fragment 后返回
- 微信/浏览器复制的图文都带 CF_HTML；速记窗「剪贴板剪藏」按钮 → invoke command → POST /api/clips（source=clipboard）走 M11.1 管线
- Tauri 2 ACL 不管控应用自定义 command（只管插件/core），capabilities 无需加项

### 6.1.2 浏览器扩展（clipper/，M11.2）
- MV3 纯 JS 无构建：contextMenus「同步到 Remainder」（selection/image 上下文）→ content script 取选区 HTML（懒加载 data-src 写回 src、baseURI 补全相对 URL）→ background fetch POST /api/clips（source=extension）→ chrome.notifications 反馈
- 服务端对 OPTIONS 预检回 `Access-Control-Allow-Private-Network: true`（Chrome 130+ PNA）
- 加载方式：chrome://extensions → 开发者模式 → 加载已解压扩展 → 选 clipper/（见 clipper/README.md）

### 6.2 定时器（server/scheduler）
- 每分钟扫描：到期任务（ddl ≤ now 且未提醒）→ 通知事件；跟进任务（next_follow_date ≤ today）→ 今日视图黄区
- 每日 21:00：聚合「今日已完成 + 当前待办」→ 调 LLM 生成总结（可选）→ SMTP 发 HTML 邮件
- 实现：`setInterval` + settings 表存 cron 配置，不引第三方 cron 库（KISS）

### 6.3 邮件
- 163 邮箱：设置→POP3/SMTP/IMAP 开启 SMTP → 生成**授权码**（非登录密码）
- Nodemailer：`{ host:'smtp.163.com', port:465, secure:true, auth:{ user:完整邮箱, pass:授权码 } }`
- 限制：日发约 50 封、避免敏感词/可执行附件

### 6.4 LLM
- OpenAI 兼容：`base_url=https://api.deepseek.com, model=deepseek-chat`，走 .env 配置
- v1.5 仅日报总结；v2 加排期分析/检索/周报生成；prompt 模板集中 `server/src/llm/prompts.ts`

### 6.5 配置（.env，不入库不入 git）
```
PORT=3210
SMTP_USER=xxx@163.com
SMTP_PASS=授权码
REPORT_TO=xxx@163.com
REPORT_TIME=21:00
LLM_BASE_URL=https://api.deepseek.com
LLM_API_KEY=sk-xxx
LLM_MODEL=deepseek-chat
LLM_ENABLED=true
NOTIFY_ENABLED=true
```

## 7. 暂存项（写入文档，暂不实施）

| 项 | 方案 | 触发条件 |
|----|------|----------|
| 云部署 | 后端原样部署到阿里云/火山/自有服务器，前端改 API base URL + 加一层鉴权 token | 需要异地 Web 访问时 |
| 多设备同步 | 单用户 last-write-wins；SQLite→Postgres 换驱动层 | 多设备使用时 |
| 离线可用 | 桌面端本地 SQLite 缓存 + 联网合并 | 断网场景变多时 |
| 飞书全量文档功能 | 多维表格/思维笔记/画板/评论/附件 | v2 之后 |
| Live2D 桌宠 | pixi-live2d-display + 官方 license（个人年收入 <1000 万日元免费、需显示 logo、用户可换模型需签约） | v3 之后 |

## 8. 风险与对策

| 风险 | 对策 |
|------|------|
| Tauri 透明窗**区域级**点击穿透（透明处穿透、内容可点）官方未支持 | Win32 动态切 `WS_EX_TRANSPARENT`（tauri discussion #12925 有现成 Rust 代码）；M3 先整窗穿透+拖动把手降级 |
| 多显示器/DPI 坐标错乱 | `availableMonitors()` + 物理/逻辑坐标换算 |
| 163 SMTP 频率限制/判垃圾邮件 | 日发 1 封；发件人昵称规范、避免敏感词 |
| Tauri 2 在 Windows 的 WebView2 依赖 | Win10 1803+ 基本内置；安装文档注明兜底安装链接 |

## 9. 参考项目（调研结论）

- **BongoCat**（22.8k★，MIT，Tauri v2 桌宠）— 桌宠实现范本
- **Mindwtr**（Tauri，GTD）— Waiting For 视图 / 每日晨报理念
- **Super Productivity**（24k★）— 任务核心交互参考
- **ThinkFlow**（Tauri+React，LLM 任务拆解）— prompt 模板可借鉴
- **clawd-on-desk**（6k★，AGPL）— 事件→状态→动画映射设计参考（勿抄代码）
- **TickTick**（闭源）— 桌面迷你挂件、每日摘要 UI 范本
