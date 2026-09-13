# M35 standup-agent 集成（AI 生成日/周/月报）

## 1. 任务背景
standup-agent（本机 `~/.local/bin/highagent`，Python CLI）扫描本机 AI coding 会话，生成工作日报/周报/月报 markdown 到 `~/daily-reports/`（日报 `YYYY-MM-DD.md`、周报 `weekly-YYYY-Www.md`、月报 `monthly-YYYY-MM.md`）。本期把它的产物接进 Remainder 报告栏目：① 报告页加「✨ AI 生成」按钮，调 highagent 生成并导入为可编辑报告；② standup-agent 侧定时跑完后可通过 HTTP 直接把 markdown 推进来。

## 2. 目标
- reports 路由支持 markdown 写入：`POST /api/reports` / `PATCH /api/reports/:id` 新增可选 `content_markdown`
- 新增 `POST /api/reports/standup`：spawn 调本机 highagent → 读产物 md → 幂等落库
- mdToTiptapJson 提取复用 + 增强：`**粗体**` 从「剥掉」改为生成 bold mark
- 前端日/周/月报页「新建」旁加「✨ AI 生成」按钮（Thinking 板块不加）

## 3. 接口契约
### POST /api/reports（增强，向后兼容）
- 新增可选 `content_markdown`：幂等 createReport 后转 Tiptap JSON 写入 content（可带 `title` 一并改标题）
- `content_markdown` 优先于 `content`；都不传时行为同旧版（任务预填模板）
- 状态码不变：新建 201 / 已存在 200

### PATCH /api/reports/:id（增强）
- 新增可选 `content_markdown`：转换后写 content，可同时带 `title`；优先于 `content`

### POST /api/reports/standup（新增）
- body：`{type: "daily"|"weekly"|"monthly", date?: string}`，date 缺省今天
- 日期换算（对齐前端 getCurrentDateForType）：daily→当天；weekly→任意一天算周一存库（`date` 列=周一 YYYY-MM-DD）、ISO 周标签 `YYYY-Www` 定位文件；monthly→`YYYY-MM`
- 流程：找可执行文件（`~/.local/bin/highagent` → PATH）→ spawn `highagent report|weekly|monthly --date <date>`（10 分钟超时）→ 读 `output_dir`（解析 `~/.config/highagent/config.toml`，缺省 `~/daily-reports`）下对应文件 → `createReport` 幂等 → 写 content + 标题「AI 日报 2026-09-13 / AI 周报 2026-W37 / AI 月报 2026-09」→ 返回报告 JSON
- 错误：400 type 非法 / date 格式非法；502 未安装 highagent、执行失败（带 stderr 尾部 500 字）、超时、exit 0 但产物缺失。highagent 已存在跳过时报 exit 0 算成功；非 0 但产物文件已在（容错：如子命令缺失但文件已由推送/新版生成）仍导入

## 4. 产出
- `server/src/services/markdown.ts`（新）：`mdToTiptapJson` 复用版，支持 #~### 标题、`-`/`*` 列表、`**粗体**` → bold mark（独立成段的 `**HRM**` 分组小标题 → 整段 bold 段落）
- `server/src/routes/reports.ts`：删本地 mdToTiptapJson 改 import；`content_markdown` 支持；standup 路由 + isoWeekLabel/mondayOf/highagentOutputDir/findHighagent/runHighagent/standupTarget/writeReportMarkdown
- `desktop/src/api/client.ts`：`api.generateStandupReport`；createReport/updateReport 类型加 `content_markdown`
- `desktop/src/pages/ReportsPage.tsx`：ReportTypePage 加「✨ AI 生成」按钮（thinking 不显示）、生成中右下角浮层「正在调用 standup-agent 生成…可能需要 1-2 分钟」、失败红色 toast（6s 自动消失）、成功后选中该报告
- `server/verify-m35-md.mjs`：mdToTiptapJson 验证脚本（12 断言）

## 5. 实现方案
highagent 是外部进程：同步 spawn 等待完成（日报已存在时秒回，新生成走 LLM 约 1-2 分钟），Fastify 单请求挂住即可，不做异步任务队列。content 必须是合法 Tiptap JSON 字符串（AGENTS.md 坑 16：前端解析失败回退空文档）。周标签算法与 highagent 的 `week_label`（ISO isocalendar）对齐，实测 2026-09-13 → `weekly-2026-W37.md` 命中。

## 6. 遇到的报错及解决方案
| 报错/问题 | 原因 | 解决方案 |
|-----------|------|----------|
| 调研时 `highagent --help` 无 monthly 子命令 | 首次查看的是旧输出（源码彼时无 monthly，之后 highagent 项目补上了；`~/.local/bin/highagent` 是指向源码 .venv 的 shim） | 以实际运行 `highagent monthly --date` 为准，实测可用；standup 路由保留「非 0 但文件已在仍导入」的容错 |
| 集成验证不能碰 server/data 真实库 | DB 路径硬编码为 dist 相对位置 | 拷贝 dist + symlink node_modules 到 /tmp/remainder-m35-test，PORT=3211 启动，库落在 /tmp 下，验证完删除 |
| curl 管道统计 bold mark 数为 0 | 响应里 content 是嵌套 JSON 字符串，引号被转义 | 改为 JSON.parse 两层后遍历节点断言 |

## 7. 验证记录
- `npx tsx verify-m35-md.mjs` → 12/12 PASS（标题/列表/bold mark/独立粗体分组头/混排/空文档/真实 09-13 日报转换无残留 `**`）
- `pnpm --filter server build` + `pnpm --filter desktop build` → 0 错误
- PORT=3211 临时实例 curl：
  - POST /api/reports 带 content_markdown → 201，GET 回来 JSON.parse 成功，结构 heading/bulletList/paragraph，`HRM`/`周报系统` 带 bold mark ✅
  - PATCH content_markdown → h3 + bold 生效，title 不被覆盖 ✅
  - POST /api/reports/standup `{type:daily,date:2026-09-13}` 真实调 highagent（已存在跳过，70ms）→ reports 表出现 `AI 日报 2026-09-13`，内容为合法 Tiptap JSON ✅；二次调用同 id 幂等 ✅
  - weekly 2026-09-13 → `AI 周报 2026-W37`，date 归一为周一 2026-09-07 ✅
  - monthly 2026-09-13 → highagent 真实生成月报并导入 `AI 月报 2026-09` ✅
  - date 非法 → 400；type=thinking → 400 ✅
- 未动 ~/Applications 安装版；未 git commit

## 8. 安装版部署与端到端验证（2026-09-13）
- 部署：`~/Applications/Remainder/server/dist` → 备份为 `dist.bak-m35` → 拷入仓库新 dist（无新依赖，node_modules 不动）→ kill 旧 node(3210) → `nohup ./node/node server/dist/index.js` 重启（沿用 start.sh 方式）→ /api/health ok，数据目录未动
- 桌面端：macOS 的 .app 需完整 `pnpm tauri build`（`--no-bundle` 只出二进制，AGENTS.md 那条是 Windows 的坑）→ 旧 `app/Remainder.app` 备份为 `Remainder.app.bak-m35` → 替换并 `open` 重启（新版二进制 shasum 与 target/release 一致，且编译时间晚于含 generateStandupReport 的前端 dist）
- e2e 链路一（Remainder → highagent）：POST /api/reports/standup `{type:daily,date:2026-09-13}` → 200，62ms，`AI 日报 2026-09-13` 落库，35 节点合法 Tiptap、28 个 bold 节点
- e2e 链路二（highagent → Remainder 推送）：`highagent report --date 2026-09-13 --force` → 日志「已同步到 Remainder：AI 日报 2026-09-13」，同 id 行 updated_at 14:32→14:35、内容更新；`highagent weekly --date 2026-09-13 --force` → 「已同步到 Remainder：AI 周报 2026-09-07」，date=周一与 Remainder 约定一致
- server.log 证据：`POST /api/reports/standup -> 200 62ms`、推送侧 `POST /api/reports -> 200/201` + `PATCH /api/reports/<id> -> 200`

## 9. 已知不一致（后续可收敛）
- 周报标题两条链路不一致：Remainder standup 路由写「AI 周报 2026-W37」，highagent 推送侧写「AI 周报 2026-09-07」（周一日期）；行是同一行（date=周一），只是标题风格不同
- highagent 推送周报时 POST /api/reports 幂等建单会先跑一遍 LLM 周报预填（约 2.5s），随后 PATCH 立即覆盖——无害但浪费一次 LLM 调用；可考虑推送时直接带 content_markdown 省掉预填
