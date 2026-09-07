# feishu-docs-clone 对齐方案（调研 + 合并可行性验证）

> 2026-09-07 · 参考仓：https://github.com/taiyuexiao/feishu-docs-clone（本机 `.tmp-feishu-clone`）
> 结论先行：**可行，且建议"换内核"路线**——把 feishu-clone 的编辑器（~4400 行、29 文件）整体移植为 remainder 文档新内核，remainder 独有功能逐件移植过去。

## 1. 双方现状对比

### 技术栈（关键：同源同代）

| | remainder | feishu-clone |
|---|---|---|
| 编辑器内核 | Tiptap **^2.11.0** | Tiptap **^2.11.5**（code-block-lowlight 2.27.3 混版） |
| UI | React 18 + Vite 6 + **Tailwind 4** | React 18 + Vite 5 + **纯 CSS（global.css 4006 行 + CSS 变量 token，无 Tailwind）** |
| 持久化 | server SQLite + FTS5 全文 + 嵌套文档树 | 纯前端 IndexedDB + 扁平文件夹 |
| 数据格式 | Tiptap JSON | Tiptap JSON（schema 超集，**老文档天然可读**） |

版本同为 2.11.x → 扩展 API 完全一致，移植无适配成本。

### 功能矩阵（✓有 ✗无 ◐部分）

| 功能 | remainder | feishu-clone |
|---|---|---|
| 常驻顶部工具栏（40px） | ✗（M21 刻意去掉） | ✓ Undo/Redo/T样式/B I U S/代码/颜色/链接/对齐/列表/任务/表格/图片/缩进/查找/历史/大纲 |
| 浮动工具栏 | ✓ 自绘（层级/字体/字号/B I/颜色/高亮/链接/润色/表格化/✨询问） | ✓ 自绘（问AI/解释/T样式/B I U S 代码/颜色/链接/缩进/评论） |
| 块把手（拖拽/+插入/块菜单） | ✓ | ✓ 更完整（[T 样式]+[⋮⋮]，空行复用斜杠菜单，Esc 块选中） |
| 斜杠菜单 | ✓ 14 项 | ✓ 更多项 + **AI 置顶渐变条** + 拼音过滤 + 328px/36px 图标块/sticky 分组 |
| 字体/字号 | ✓（FontFamily + 自写 FontSizeAttr） | ✗（刻意对齐飞书"无字号"） |
| 下划线/对齐 | ✗ | ✓（Underline + TextAlign） |
| 标题 | H1-H3 | **H1-H9 渐进解锁**（用到 H3 才出现 H4…） |
| 中文 Markdown 即时转换 | ✗ | ✓（markRules 放宽规则） |
| Markdown 粘贴转块 | ✗ | ✓（mdPaste） |
| 表格 | ✓ 列宽拖拽 + 粘贴识别/选中表格化（tableDetect，我们独有） | ✓ 列宽拖拽 + **单元格背景色/对齐** |
| 代码块 | ✓ 基础 | ✓ **lowlight 语法高亮 + 语言搜索 + 复制 + 自动换行** |
| 公式 KaTeX | ✗ | ✓ 块级+行内+$...$ 输入 |
| Callout 高亮块 | ✗ | ✓ |
| 分栏 Grid | ✗ | ✓ |
| @提及/日期胶囊 | ✗（知识库侧有 @人） | ✓ |
| 图片 | ✗（有扩展未用） | ✓ 缩放手柄/对齐/题注（base64） |
| 查找替换 ⌘F | ✗ | ✓ |
| 版本历史 | ✗ | ✓ 快照（上限 50，去重） |
| 评论 | ✗（知识库条目有，文档内无） | ✓ CommentMark 划线评论+面板 |
| 阅读/编辑模式 | ✗ | ✓（E 键） |
| 暗色模式 | ✗ | ✓（data-theme） |
| 文档 emoji/封面/页面宽度 | ✗ | ✓ |
| 导出 | ✓ Markdown 到本地（我们独有） | ◐ 仅打印/PDF |
| AI | ✓ **走 server 代理（DeepSeek key 不落前端）**：✨询问三沉淀/AI 排版/流式纠错/错别字批处理（M16/M18，我们独有） | ◐ 页面直连 OpenAI 兼容 API（key 存 localStorage）：AI 侧栏多轮流式/一键排版/AI 帮我写 |
| 文档树 | ✓ **嵌套树 + 自实现拖拽**（我们独有） | ✗ 扁平文件夹 |
| 协作 | ✗ | ✗（双方都无，头像组是 Mock） |

### UI 数值差异（remainder 对齐目标）

| 项 | remainder 现在 | feishu-clone（飞书真值） |
|---|---|---|
| 正文宽度 | 760px | **800px**（宽版 1120px） |
| 正文字号/行高 | ~14-15px | **16px / 1.7** |
| 文档标题 | 32px | **40px / 700** |
| H1/H2/H3 | 未严格定 | 30/24/20（H4-9 渐进） |
| 顶栏 | 无常驻栏 | TopBar 56 + Toolbar 40 |
| 主色 | indigo-600 | **#3370FF 飞书蓝**（浅底 #E1EAFF） |
| 选区色 | 浏览器默认 | rgba(51,112,255,.18) |
| 灰阶 | slate 系 | #1F2329/#646A73/#8F959E/#BBBFC4 |
| 斜杠菜单 | 自研样式 | 328px 宽/36px 图标块/sticky 分组/AI 置顶 |
| 拖拽指示线 | 蓝色 2px | 2px + 蓝色光晕 |

## 2. 合并方案（推荐：换内核路线）

**思路**：`desktop/src/editor2/` 整体搬入 feishu-clone 的 `src/editor/*` + `src/components/icons.tsx`，EditorPage 改造为 remainder 的文档编辑视图；remainder 现有 `editor/` 保留至切换完成后删除。

### 步骤分解（每步可独立验证）

**S1 依赖与地基**（半天）
- 补依赖：`@tiptap/extension-underline` `@tiptap/extension-text-align` `@tiptap/extension-code-block-lowlight@^2.27.3` `lowlight` `highlight.js` `katex`（版本全部对齐 2.11.5/2.27.3）
- 样式引入：feishu-clone 的 global.css 抽出设计 token（`:root` 变量）+ 全部 `.fe-*` 类，作为 `editor2/fe.css` 只在文档页容器引入；**与 Tailwind 共存验证**（.fe- 前缀天然隔离，仅需防 `*{box-sizing}`/body 基础样式污染——方案：删掉全局 reset 行，body 字体移到 `.fe-doc-root` 作用域）

**S2 内核移植**（1 天）
- 拷贝 `src/editor/*`（29 文件）+ `icons.tsx` → `desktop/src/editor2/`
- `extensions.ts` 的 buildExtensions() 原样可用；editorProps 粘贴/拖拽图片保留 base64（后续可换 server 图床）
- 新建 `EditorShell.tsx`：以 feishu-clone EditorPage 为底，数据层换成 remainder：
  - 读：`api.getDocument(id)` → editor.setContent；写：500ms 防抖 `api.updateDocument`（沿用其保存状态 UI）
  - 快照：存 server（新增 `doc_snapshots` 表）或先存 localStorage（KISS 先 localStorage，键含 docId）
  - 评论：先保留其 IndexedDB 版 → 后续接 server comments（v14 已有 comments 表，加 doc_id 维度即可）

**S3 remainder 独有功能回植**（1 天）
- **字体/字号**：`textStyle.ts` 的 FontSizeAttr 注册进新内核 + Toolbar 加字体/字号下拉（FloatToolbar 逻辑搬入）——**同时解决老文档兼容**（老文档里的 fontSize 属性不丢）
- **AI 三件套**：ai/config.ts 的 streamChat 改走 remainder `POST /api/llm/chat`（DeepSeek key 不出 server）；✨询问三沉淀（补充/替换/评论）移植进 BubbleToolbar 的"问问AI"；AI 排版沿用其 AutoFormat 但走 server LLM
- **错别字检查**（M18 双通道）挂到新 Toolbar（流式纠错开关 + 批处理弹窗）
- **表格识别**（tableDetect 粘贴自动转 + 选中表格化）注册进新 editorProps
- **导出 Markdown**：Toolbar 加导出（走现有 server `/api/documents/:id/export`）

**S4 接入与切换**（半天）
- DocsPage：编辑区从旧 editor 切到 EditorShell（文档树/拖拽/搜索全部不动——这是我们的优势项）
- 老文档回归：M23 前后建的文档逐个打开确认（schema 超集 + FontSizeAttr 已回植）
- e2e：headless Edge 跑斜杠菜单/表格/AI/保存闭环断言

**S5 清理**
- 删旧 `desktop/src/editor/`（FloatToolbar/BlockHandle/slashCommand 等被新内核取代的）
- 删 `.tmp-feishu-clone`

### 明确不做（本次范围外）

- 多人协作/Yjs（双方都无；feishu-clone 头像组是 Mock，不搬）
- 多维表格/电子表格（feishu-clone 用 MockBlock 占位卡片，可搬但不展开）
- 暗色模式（remainder 全局无暗色体系，单独议题）
- 文档内评论接 server（先 IndexedDB/localStorage，后续接 v14 comments 表）

### 需要你拍板的两个 UI 决策

1. **常驻工具栏**：M21 时我们刻意去掉了常驻格式栏（当时理解飞书是"轻"的），但 feishu-clone（和你认可的"完全复刻"）是有 40px 常驻 Toolbar 的。**建议恢复常驻栏**——这是不是你觉得"一直对不齐"的核心点？
2. **字体/字号**：飞书官方无字号概念，feishu-clone 刻意不做；remainder 有你用过的字体/字号。**建议保留**（反正飞书字号档位是用户呼声很高的功能，保留不亏）。

## 3. 风险与验证

| 风险 | 验证方式 | 缓解 |
|---|---|---|
| global.css 4006 行与 Tailwind 冲突 | S1 完成后开文档页目视+截图比对 | .fe- 前缀隔离 + 删全局 reset + CSS 作用域 |
| 老文档内容兼容 | S4 回归真实文档 | 同 Tiptap JSON + FontSizeAttr 回植 |
| code-block-lowlight 混版本（2.27.3 vs 2.11.5） | S1 构建 | feishu-clone 已验证可用，照抄版本 |
| 体积（katex/highlight.js 增大 bundle） | 构建看 chunk | 编辑器页已是独立 chunk，可再 lazy |
| 工作量超预期 | 每步独立验证 | S2 内核先跑通，S3 逐件加，可中途交付 |

## 4. 工期估计

S1 半天 + S2 一天 + S3 一天 + S4 半天 ≈ **3 天当量**（含每步验证与 e2e）。
