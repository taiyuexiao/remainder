# M16 文档内置 LLM（询问沉淀 + AI 排版）

## 1. 任务背景

对标豆包划词问答但超越之：豆包只能"问完就走"，我们把 LLM 的回答**直接沉淀进文档**（补充/替换/评论三种落法）。另加「AI 排版」：写完文档后一键让 LLM 重建标题层级与列表结构，省去手动整理。

## 2. 目标

1. 文档中选中文本 → 浮动工具栏 ✨ → 就选中内容提问 → 回答可三种方式落回文档
2. 编辑器工具栏「✨ AI 排版」→ LLM 通读全文规范结构 → 一键替换文档内容

## 3. 实现

### 3.1 询问 LLM（划词问答 + 沉淀）
- server：`askAboutText(text, question)`（阅读助手人格 prompt，防编造）→ `POST /api/llm/ask`
- desktop：浮动工具栏加 ✨ 按钮 → DocEditor 捕获选区（text + from/to）→ 右上角固定面板：选中预览 + 提问输入 + 回答区 + 三个沉淀按钮
- 沉淀方式：
  - **⬇ 补充到下方**：`insertContentAt(to, <blockquote>🤖 …)` —— 原文不动，答案挂下面
  - **⇄ 替换选段**：`insertContentAt({from,to}, …)` —— 用回答替换原文
  - **💬 作为评论**：`insertContentAt(to, <blockquote>💬 评论：…)` —— 评论式插入
- 插入后走原有 debounce 自动保存

### 3.2 AI 排版
- server：`formatDocument(text)`（排版助手 prompt：规范 #/##/### 层级、列表标记、不改实质内容）→ `POST /api/llm/format`
- desktop `editor/mdConvert.ts`：
  - `extractStructuredText(editor)`：编辑器 → 带结构标记文本（保留现有层级供 LLM 修正；表格转 markdown 管道）
  - `markdownToDoc(md)`：LLM 输出 → Tiptap JSON（标题/任务/无序/有序/引用/代码块/分割线/表格/段落全覆盖）
- 工具栏「✨ AI 排版」：confirm 提示（行内样式会丢失）→ formatDoc → `setContent` → 自动保存

## 4. 产出

| 文件 | 说明 |
|------|------|
| `server/src/llm/index.ts` | +`askAboutText` / `formatDocument` |
| `server/src/routes/llm.ts` | +`/api/llm/ask` / `/api/llm/format` |
| `desktop/src/editor/mdConvert.ts` + `pmTypes.ts` | 结构文本互转 |
| `desktop/src/editor/FloatToolbar.tsx` | +✨ 按钮（onAskAi prop） |
| `desktop/src/pages/DocsPage.tsx` | 询问面板 + AI 排版按钮 |
| `desktop/src/api/client.ts` | +`askLlm` / `formatDoc` |
| `server/scripts/test-md-convert.ts` | 转换器单测（11 例） |

## 5. 验证记录

- `markdownToDoc` 单测 11/11（真实 LLM 输出 / 任务列表 checked / 引用 / 代码块 / markdown 表格）
- `/api/llm/ask` 真实 DeepSeek 调用：回答准确切题 ✓
- `/api/llm/format` 真实调用：平铺文本 → 正确的 #/## 层级 + 列表 ✓
- e2e（一次性文档用后删）：✨ 开面板 ✓ → 提问 → DeepSeek 返回 ✓ → 补充到下方插入 `🤖` 引用块 ✓
- build 0 错误

## 6. 注意事项

- AI 排版会把文档压成纯文本结构重建：**颜色/高亮/链接等行内样式会丢失**（confirm 已提示，建议先导出备份——M13 的导出按钮正好配套）
- PowerShell 里 curl 测 JSON body 接口别用 `'{\"...\"}'` 内联转义（会产生 500 假象），用 `--data-binary @file`
