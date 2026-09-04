# M19 AI 助手页 + 文档导入

## 1. 任务背景

① 参考 ChatGPT/豆包：应用内置对话入口，左侧会话历史 + 主对话区；支持自然语言输入日程/计划/任务并直接落到对应板块（GPT/Codex 式"对话即操作"）。② 本地文档（md/docx/pdf）一键导入知识库。

## 2. 目标

1. 「🤖 AI 助手」页：会话 CRUD + 对话流 + 任务意图自动落库 + 落库动作以卡片展示
2. 文档页「+」→「导入文件」支持 .md/.txt/.docx/.pdf

## 3. 实现

### 3.1 会话与 NL 建任务
- DB v10：`conversations` + `chat_messages`（actions JSON 存已执行动作）
- `chatAssistant(message, today, projectNames)`：LLM 返回 `{"reply","actions":[{"action":"create_task","title","type","project","ddl","person","next_follow_date"}]}`，稳健解析（截取 JSON 对象）
- 落库规则：
  - idea → 平铺想法任务
  - project 名模糊命中现有项目 → 挂子任务
  - main/side/follow 无命中 → 以标题建新项目（follow 附 person/next_follow_date）
- 首条消息自动命名会话

### 3.2 ChatPage（desktop/src/pages/ChatPage.tsx）
- 左侧 240px 会话栏：新对话按钮、列表（标题+最后消息预览、hover 删除）
- 主区：用户右气泡（indigo）/ 助手左气泡（白卡）+ 动作 emerald 卡片 + 时间戳；思考中动画
- 输入区：多行自适应 textarea，Enter 发送 / Shift+Enter 换行 / IME 组合输入不误发
- 空状态引导（三个示例句式）

### 3.3 文档导入
- server：`@fastify/multipart`（30MB 上限）+ `POST /api/documents/import`
  - md/txt → utf8 直读；docx → mammoth 转 HTML；pdf → pdf-parse v2（`new PDFParse({data}).getText()`）提文本
  - title=文件名去扩展名；summary 标记「本地导入」；入 FTS 索引
- desktop：NewDropdown +「📥 导入文件」（hidden file input），导入后直接打开新文档

## 4. 验证记录

- 会话+落库（真实 DeepSeek）：
  - 「明天下午5点前要交评测平台的周报」→ 命中现有项目「评测平台」挂子任务 ✓
  - 「催一下张三的资源申请，下周三前要有结果」→ 建跟进项目 + ddl 解析为下周三（2026-09-04/09）✓
- e2e UI：空状态 ✓ → 发送 → 回复 + ✓动作卡片 ✓
- md 导入 ✓（docx/pdf 走 mammoth/pdf-parse 成熟库，代码路径已审）
- 测试产生的会话/项目/任务已全部清理
- build 0 错误

## 5. 注意

- pdf-parse v2 API 与 v1 完全不同（PDFParse 类 + getText），别照抄旧教程
- LLM 未给项目名时以整句作项目名，后续可加"短标题抽取"优化
