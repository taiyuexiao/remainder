# AGENTS.md — Remainder 项目协作约定

任务规划与提醒助手。pnpm monorepo：`server/`（Fastify5 + SQLite better-sqlite3）、`desktop/`（Tauri2 + React18 + Vite6 + Tailwind4）、`clipper/`（MV3 扩展）、`server/mcp-server/`。

## 流程约定

- 每个里程碑写 `docs/modules/Mx-名称.md`，必含「报错及解决方案」表
- 构建验证：`pnpm --filter server build` + `pnpm --filter desktop build` 须 0 错误
- 功能要 e2e 实测：server 用独立 PORT 实例 + `server/verify-mX.ps1`；UI 用 headless Edge + puppeteer-core（装在 `.tmp-e2e/`，用完即删）
- 调研类方案先写文档存档（`docs/research/`），再动手

## 关键历史教训（踩过的坑）

1. **改了没生效，先怀疑 3210 端口被旧 node 孤儿进程占着**（部分进程是管理员权限启动的，普通终端 taskkill 会被拒，需任务管理器手动结束）。验证：curl 新版才有的路由看是否 404
2. **exe 必须用 `pnpm tauri build --no-bundle`**；裸 `cargo build` 出的是 dev 模式，连 1420 报 ERR_CONNECTION_REFUSED
3. **exe 重编固定流程**：旧 exe 重命名为 remainder.oldN.exe（运行中进程占用删不掉就重启电脑后清理）→ tauri build → 通知用户重启
4. **别用 HTML5 DnD**（Tauri WebView2 不可靠），用自实现 mousedown/move/up
5. **别用 Tiptap 官方 BubbleMenu**（移动 DOM 会崩 React 树），浮动条自绘手动定位
6. **pnpm deploy 的 symlink 布局不能拷贝分发**；CI 打包用 `node-linker=hoisted` 重装生产依赖
7. **bat 文件必须纯 ASCII + CRLF**；PowerShell 5.1 下 curl 必须用 `curl.exe`（IWR 对二进制流有 bug）；中文输出乱码是编码问题非错误；管道捕获 stderr 会误报 exit 1
8. **HTTP 头仅 Latin-1**：中文塞进自定义头（如 x-user-name）浏览器会同步抛错；客户端 encodeURIComponent、服务端 decode
9. **Tauri npm 包与 crate 版本必须 major.minor 对齐**（tauri-plugin-notification 曾因 2.4.0 vs 2.3.3 构建失败）
10. **git push 到 GitHub 时好时坏**（21s 超时常见），命令里要内置重试循环；cargo 用官方 crates.io 源（镜像都不通）
11. **curl.exe 输出是 GBK 字节流**：PowerShell 管道接 `ConvertFrom-Json` 解析含中文的 JSON 必炸——要处理中文 JSON 用 node `fetch` 脚本，别用 PS 管道；同理 **node -e 命令行里的中文参数会被 GBK 化**，中文逻辑写到临时 .cjs 文件再跑
12. **ps1 脚本必须纯 ASCII**（注释和字符串数据也一样）：PS 5.1 把无 BOM 的 .ps1 当 GBK 读，中文直接炸语法
13. **PS 5.1 管道单结果 `.Count` 不可靠**（`(管道 | Where-Object).Count` 单结果时可能不是 1）——断言一律 `@(...).Count`
14. **测试端口实例要先验证身份再测**：`Get-NetTCPConnection -LocalPort <port> -State Listen` 确认 OwningProcess 是刚启动的 pid，避免打到旧 dist 残留实例
15. **puppeteer 按文本点击会被遮罩下的同名元素截胡**：弹窗里的点击必须限定容器选择器（如 `div.fixed.z-50 button`），否则点到遮罩触发 onClose，测试假阳性

## 环境

- 本地启动：根目录 `启动Remainder.bat`（起 server + remainder.exe），桌面图标指向它
- 数据：`server/data/`（remainder.db、live2d-models/、exports/），全部 gitignored
- LLM：DeepSeek，配置在 `server/.env`（LLM_API_KEY），走 `/api/llm/chat`
- CI：`.github/workflows/release.yml`（workflow_dispatch + v* tag），Windows/Mac 双平台 artifact
