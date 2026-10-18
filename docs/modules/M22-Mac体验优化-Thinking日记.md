# M22 Mac 体验优化：IME 回车修复 + Inbox 编辑 + Thinking 日记

## 1. 任务背景

Mac 版实机使用暴露两个问题和一处新需求：

1. **IME 回车 bug（macOS 特有）**：中文输入法组词期间按回车（本义是确认候选词上屏），
   页面的 keydown 处理器把这次回车当成"提交"执行了——速记框直接存入、Inbox 弹窗直接提交
2. **Inbox 只能新建/转换/删除**，写错的速记无法打开修改
3. **新功能**：报告栏目下增加 Thinking 板块作日记，进入需密码（本地前端门禁）

## 2. 目标

1. 组词期间的回车不触发任何提交/关闭行为（isComposing 守卫）
2. Inbox 条目点击可打开编辑（内容 + 标签）
3. 报告首页出现 Thinking 卡片，输入密码才能进入，进入后是与报告同体验的日记编辑器

## 3. 需求与实现

### 3.1 IME 回车修复

- 根因：macOS 中文输入法组词中按 Enter，composition 未结束但 keydown(Enter) 已派发到页面
- 修法：所有处理 Enter/Escape 的 keydown 入口先判 `e.nativeEvent.isComposing`，组词中直接 return
- 涉及文件：`CapturePage.tsx`（全局速记框根节点 onKeyDown）、`InboxPage.tsx`（弹窗 textarea / 标签 input）、
  `ReportsPage.tsx`（Thinking 密码框）
- **2026-10-02 补修（见报错表第 4 行）**：纯 isComposing 守卫在 WKWebView 上漏掉
  "确认候选词"那一条回车（compositionend 先派发，随后 keydown 的 isComposing 已是 false）。
  升级为 `desktop/src/ime.ts` 的 `useImeGuard()`：compositionstart 置位标记 +
  compositionend 延迟到下一个宏任务复位 + keyCode 229 兜底，覆盖两种派发顺序。
  守卫范围从 3 处扫到 7 个文件全部裸 Enter/Escape 入口（速记、AI 助手、桌宠聊天、
  Inbox 两处、Thinking 密码框、文档 InlineCreator、任务页三处新建输入框）

### 3.2 Inbox 打开编辑

- 后端：`PATCH /api/inbox/:id`（content/tags；content 去空白后为空 → 400）
- 前端：InboxPage 弹窗复用为新建/编辑双态（`editItem` 状态），
  条目内容点击或"编辑"按钮打开；保存后刷新列表

### 3.3 Thinking 日记（密码 335435）

- 存储：复用 reports 表，`type='thinking'`，同日去重逻辑与报告一致（`日记 yyyy-mm-dd`），
  享受现成的 Tiptap 编辑器 / 自动保存 / 历史列表
- 迁移：**v18**——reports.type 的 CHECK 约束原为 `IN ('daily','weekly','monthly')`，
  SQLite 不支持改 CHECK，重建表放开 `thinking`；
  重建时按 (type,date) 去重留最新（见报错表）
- 门禁：纯前端。ReportsPage 第 4 张卡片 🔒 Thinking → 密码弹窗 → 正确则
  `sessionStorage['thinking-unlocked']='1'`，本次会话内免密；错误提示"密码错误"
- 注意：这是防随手点开的界面门禁，数据库内容本身未加密

## 4. 产出

- `desktop/src/pages/CapturePage.tsx`、`InboxPage.tsx`、`ReportsPage.tsx`：isComposing 守卫
- `desktop/src/ime.ts`（2026-10-02 补修）：`useImeGuard()` 共享守卫 hook，接入
  `CapturePage`、`ChatPage`、`PetPage`、`InboxPage`、`ReportsPage`、`DocsPage`（InlineCreator）、
  `TasksPage`（ProjectColumn/ProjectFolder/IdeaSection 三处输入框）
- `server/src/routes/inbox.ts`：PATCH /api/inbox/:id
- `server/src/routes/reports.ts`：type 放开 thinking，thinking 不预填任务内容（空文档）
- `server/src/db/schema.ts`：migrateToV18（重建 reports 表 + 去重）
- `desktop/src/pages/ReportsPage.tsx`：Thinking 卡片 + 密码弹窗；ReportTypePage 支持 thinking
- `desktop/src/api/client.ts`：`api.updateInbox`；createReport type 放宽

## 5. 遇到的报错及解决方案

| 报错/问题 | 原因 | 解决方案 |
|-----------|------|----------|
| 创建 thinking 报告 500：CHECK constraint failed: type IN (...) | reports 表 v7 的 CHECK 约束不含 thinking | v18 迁移重建表放开 |
| **真实库迁移崩了**：UNIQUE constraint failed: reports.type, reports.date，服务起不来 | 用户真实库中 2026-08-31 周报有 4 条重复行（v9 唯一索引前连点产生），重建表后建唯一索引失败；且迁移非事务，中途失败留下半完成状态 | ① 迁移改为事务（BEGIN/COMMIT/ROLLBACK）② 拷贝时按 (type,date) 去重，保留 updated_at 最新行。重复行均为同秒自动生成的周报变体，丢弃无损失 |
| macOS 点红色叉号后程序坞图标点击无反应 | macOS 关窗只销毁窗口不退出进程；点程序坞图标系统发 `RunEvent::Reopen`，应用未处理；单实例插件只管二次启动进程 | 抽 `open_or_rebuild_main()`（有则唤出/无则按 conf 参数重建），同时挂到单实例回调和 `RunEvent::Reopen`（`.build()` + `app.run()` 接管事件循环） |
| **2026-10-02** 速记框打英文（如 ai）按回车上屏，回车同时触发"存入"关掉面板；AI 助手/桌宠聊天等裸 Enter 提交的输入框同理 | isComposing 只挡得住"组词过程中"的 keydown；WKWebView 确认候选词时的顺序是 compositionend 先派发、确认键 keydown 后派发，该 keydown 的 isComposing 已是 false（Inbox textarea 用 Ctrl+Enter 提交所以当年没暴露） | `desktop/src/ime.ts` 的 `useImeGuard()`：composition 标记 + isComposing/keyCode 229 + 事件时间戳兜底（确认键 keydown 与 compositionend 同属一次按键，timeStamp 几乎相同，人手下一次回车至少相隔几十毫秒）；统一替换全部 7 个文件裸 Enter/Escape 入口的守卫 |
| **2026-10-02** 首轮修复后用户实测"没变化" | 用户跑的是 9/13 构建的 0.2.6 打包版（前端资源构建时嵌入 .app，改源码不重编不生效），进程自周二起一直没退出 | 守卫加固为时间戳兜底后重编 0.2.7，替换安装目录（旧包留 `Remainder.old1.app`）；教训同 Windows 侧"改了没生效先怀疑旧实例"——**macOS 上改桌面端前端必须重编 .app 并替换 + 用户完全退出重启** |

## 6. 验证记录

- 接口级（独立 PORT=3212 实例）：inbox PATCH 改内容/标签 ✅、空内容 400 ✅、
  thinking 创建/同日去重/类型过滤 ✅、daily 报告不受影响 ✅
- v18 迁移在带旧 CHECK 的库上执行成功 ✅
- 真实库（~/Applications）：迁移成功，周报 4→1 去重，报告总数 8→5，
  thinking 日记创建成功 ✅，`/api/health` ok ✅
- `pnpm --filter server build` / `pnpm --filter desktop build`：0 错误 ✅
- IME 修复为 WebKit 标准手法（isComposing），实机用中文输入法验证
- 2026-10-02 补修：`pnpm tauri build` 0.2.7 构建 ✅（desktop build 0 错误；新守卫代码确认在
  dist 产物中）；已替换安装目录并验证 Info.plist 版本 0.2.7 ✅，待用户完全退出重启后实机复测
  （速记框打英文回车上屏、AI 助手发英文、任务名混输英文三类入口）
- Dock 重开修复（v0.2.6）：`open -a` 触发 Reopen 路径无异常、进程保持单实例 ✅；
  销毁+重建路径实机手测（点叉号 → 点程序坞图标，主窗口恢复）
