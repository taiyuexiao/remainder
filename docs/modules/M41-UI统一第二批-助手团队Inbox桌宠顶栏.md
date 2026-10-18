# M41 — UI 统一第二批：AI 助手/团队/Inbox 弹窗/桌宠唤回/编辑器顶栏

> 日期：2026-10-18 ｜ 状态：已完成（desktop 端，server 无改动）

## 背景

M40 只统一了主导航与文档栏目，用户反馈四点遗留：

1. AI 助手、团队等页面仍是旧样式（indigo 配色 + emoji 图标），与文档模块的新设计语言割裂
2. Inbox「编辑速记」弹窗太小（480px / 4 行文本框）且样式老旧
3. 设置页「唤回桌宠」点击后桌宠仍然回不来
4. 文档编辑器顶栏：① 固定的三个模拟多人协作头像占位（早期实现留存的假数据）；② 窄窗口下「正文/默认字体/默认」被挤成竖排，右上「阅读」也换行

## 改动清单

### ① 全局品牌色扫尾（16 个页面文件）

perl 词边界替换把所有 `indigo-*` Tailwind 类迁到 fe token（`--brand` / `--brand-hover` / `--brand-light` / 品牌蓝 rgba），带 `hover:` `focus:` `accent-` 前缀的变体自动兼容。涉及 Today/Calendar/Timeline/Tasks/FollowUps/Inbox/Clips/Reports/Canvas/Settings/Capture/Auth/KnowledgePanel/WorkLibraryPanel/Chat/Teams。

### ② ChatPage / TeamsPage 精修

- 空状态 🤖 emoji → `IconBot` SVG（品牌蓝图标容器）；会话删除 🗑 → `IconTrash`
- 团队页：头部 👥 → `IconUsers`；层菜单 ⚡💬📚📐 → `LAYER_ICON` SVG 映射（IconZap/IconMessage/IconFile/IconClipboardList）；📥/👤 → IconImport/IconUsers；个人空间 🏠 → IconFolder；新建团队按钮 ＋ → IconPlus
- KnowledgePanel 第三栏标题的 ⚡ emoji 暂保留（后续随手换）

### ③ Inbox 编辑弹窗重做（InboxPage.tsx）

- 480px/4 行 → **640px/12 行**（resize-y 可拉伸），新建与编辑共用
- 结构：标题栏（品牌蓝图标容器 + 标题 + 关闭钮）/ 正文区 / 标签行 / 底栏（左：Ctrl/⌘+Enter 快捷键提示；右：取消 + 品牌色保存钮）
- 全部走 fe token；遮罩改 `bg-black/30 + 轻磨砂`，点遮罩关闭改 `onMouseDown` 判定

### ④ 桌宠唤回修复（SettingsPage.showPet）

旧实现只调 `pet.show()`，且窗口不存在时**静默无操作**。四步兜底：

1. 窗口不存在 → 明确提示「请重启应用重建」（不再静默）
2. `setVisibleOnAllWorkspaces(true)`——隐藏过的窗口 show() 只回原空间原位置，若当时在别的桌面/屏幕外就永远看不见；设为全工作区可见后 show() 必落在当前桌面
3. `setFocus()` 抢焦点辅助 macOS orderFront
4. 位置兜底：`outerPosition` 落在任一可见显示器范围外（含接外接屏后拔掉的场景）→ 拉回主屏右下角（与 Rust 启动定位一致）

### ⑤ 编辑器顶栏（EditorPage.tsx / Toolbar.tsx / fe.css）

- 移除固定的「我/张/李」三个假协作头像（暂无多人编辑）；「已保存」状态保留
- 工具栏防挤压：`.fe-toolbar` 改 `overflow-x: auto`（滚动条隐藏）+ 直接子元素 `flex: none`——「正文/默认字体/默认」等文字按钮任何窗宽下都保持横排
- 工具栏横向**拖动滚动**：按住左键拖动即横向滚动，拖动中 `grabbing` 光标 + 禁选区，拖动后拦截紧跟的误触 click（capture 阶段）
- `.fe-mode-btn`（阅读按钮）加 `flex: none; white-space: nowrap`，窄窗口不再竖排

## 验证

- `pnpm --filter desktop build` 0 错误；`grep indigo pages/` 归零
- 独立实例无头浏览器截图：AI 助手页（品牌蓝按钮 + SVG 空状态）✓、团队页（SVG 图标层菜单）✓、Inbox 新弹窗（640px 大编辑区）✓、1000px 窄窗口下编辑器顶栏（无头像、工具栏 scrollWidth 1057 > clientWidth 536 可拖动、「正文/默认字体」横排、「阅读」横排）✓
- 桌宠修复逻辑无法在无头环境验证（Tauri 多窗口），走真机验证路径：隐藏桌宠 → 设置页点「唤回桌宠」

## 报错及解决方案

| # | 报错 / 现象 | 原因 | 解决 |
|---|---|---|---|
| 1 | `Property 'currentMonitor' does not exist on type 'Window'` | 装的 @tauri-apps/api v2 版本 Window 实例上没有该实例方法（只有模块级函数） | 改用模块级 `availableMonitors()` + `primaryMonitor()`，按 `outerPosition` 落点自己算所在显示器 |
| 2 | 页面里遗留 `hover:bg-indigo-400` 等漏网变体 | 初版替换表没收录 400 档 | 补 `ring-indigo-400` / `accent-indigo-600` / `hover:bg-indigo-400` 三条后归零 |
| 3 | 编辑器顶栏「阅读」仍竖排 | 它在 `.fe-topbar` 里，不在 `.fe-toolbar` 容器内，工具栏的防挤压规则覆盖不到 | 单独给 `.fe-mode-btn` 加 `flex:none; white-space:nowrap` |

## 已知边界

- 窗口极窄时顶栏右侧按钮可能被裁切（均 `flex:none` 不收缩）——阅读/分享是低频入口，接受
- KnowledgePanel 内容区标题、其余页面内部的少量装饰 emoji 未逐一替换（内容型图标工作量大，留后续）

## 二批（同日）：AI 助手输入区轻量化 + 桌宠改默认隐藏/重建唤回

用户对首批结果的两点追加反馈：

1. AI 助手「+ 新对话」高饱和大蓝按钮格格不入；输入框与「发送」文字按钮傻大笨粗
2. 桌宠唤回在真机上依旧无效 → 拍板：**启动默认不打开桌宠**，唤回改为可靠路径

### 改动

- **新对话按钮**：品牌蓝大按钮 → 白底描边轻量按钮（IconPlus + 13px 文字），与侧栏气质一致
- **输入容器**：浅灰底 → 白底 + 轻阴影 + 细边框，focus 只描边不 ring；placeholder 去掉括号里的快捷键说明
- **发送按钮**：「发送」文字按钮 → 36px 图标按钮（`IconSend` 实心三角上扬 18°，NavIcons 新增），浅灰底深色三角，对应参考图二
- **桌宠**：
  - `tauri.conf.json` pet 窗口加 `"visible": false` → 启动默认不显示
  - 新增 Rust 命令 `show_pet`：销毁旧 pet 窗口（`destroy()`）→ 延时 250ms 后 `WebviewWindowBuilder::from_config` 重建（覆盖 `visible(true)`）→ 定位屏幕右下角 + 抢焦点；已注册进 generate_handler
  - SettingsPage `showPet` 改为 `invoke('show_pet')`（此前的前端 show/焦点/位置兜底方案真机无效，废弃）

### 报错及解决方案（二批追加）

| # | 报错 / 现象 | 原因 | 解决 |
|---|---|---|---|
| 1 | 前端 `setVisibleOnAllWorkspaces + show + setFocus + 位置兜底` 真机依旧唤不回 | 隐藏过的透明 WKWebView 窗口在 macOS 上 show 后存在空间/渲染层面的不可靠；前端层无法根治 | 放弃前端 show，改 Rust 侧销毁重建窗口（重建 = 全新渲染树，必然可见），前端只 invoke |
| 2 | Rust `warning: unused import: tauri::Manager` | show_pet 外层与线程内重复导入，线程内只用了窗口固有方法 | 删线程内重复导入 |
| 3 | 重建 pet 窗口与旧窗口 label 冲突风险 | `destroy()` 异步落到主循环，立即 build 同 label 可能撞车 | spawn 线程延时 250ms 再重建 |

### 边界（二批追加）

- 桌宠重建后 localStorage 尺寸/引擎设置自动生效（PetPage 挂载时自读）；但右键菜单的窗口位置记忆不保留——唤回固定出现在屏幕右下角
- 「唤回桌宠」按钮在非 Tauri 环境（浏览器 dev）下会报错，与原行为一致（isTauri 分支本就不渲染桌宠设置卡）

## 三批（同日）：应用图标更换

- 源图 `~/Downloads/icon.png`（1024×1024 PNG）→ `pnpm tauri icon` 重生成全套图标（icon.icns / icon.ico / 各尺寸 PNG / Square*Logo / Android mipmap），落盘 `desktop/src-tauri/icons/`
- 重编部署：`~/Applications/Remainder/app/Remainder.app` 与 `/Applications/Remainder.app` 双处更新（旧版备份 `.bak-0.2.8-m41b`），`killall Dock` 刷新 Dock 图标缓存后重启

| # | 现象 | 原因 | 解决 |
|---|---|---|---|
| 1 | 换图标后 Dock/访达仍显示旧图标 | macOS 图标缓存（iconservices）按 bundle id 缓存 | `killall Dock`；顽固时 `killall Finder` 或注销重登 |


- 桌宠唤回修复需真机确认（无头环境无 Tauri 多窗口）；若桌宠窗口被系统级销毁（非隐藏），当前提示重启重建，后续可加 Rust 侧重建窗口命令
