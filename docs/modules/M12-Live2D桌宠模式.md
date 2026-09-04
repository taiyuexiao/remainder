# M12 真 Live2D 桌宠模式（Open-LLM-VTuber 式）

## 1. 任务背景

M9 的桌宠是「单张立绘 PNG + Canvas 条带扭曲」的伪 Live2D 方案（当时因 Live2D license 红线和绑骨工作量选择）。调研 Open-LLM-VTuber 后发现其模式是**加载现成 Cubism 模型包**（pixi-live2d-display 渲染 + 透明桌宠窗口），换形象 = 换模型文件夹，无需自己绑骨。本功能点在不改动 M9 方案任何行为的前提下，新增独立的真 Live2D 模式，双模式可切换。

## 2. 目标

1. 设置页可切换形象引擎「立绘（内置）/ Live2D 模型」，默认仍为立绘，即时生效
2. 用户把含 `.model3.json` 的模型包丢进 `server/data/live2d-models/<名称>/` 即可在设置页选择使用
3. Live2D 模式下保留全部交互：分区点击/摸头/害羞/双击聊天/右键菜单/拖拽/任务提醒/视线跟随/三档尺寸
4. 模型缺失或加载失败自动回落立绘模式并气泡提示

## 3. 需求

- server：
  - `GET /api/live2d/models`：扫描模型目录，返回 `[{name, url}]` + 目录绝对路径
  - `GET /api/live2d/files/:dir/*`：流式下发模型文件（moc3/贴图/动作/表情，支持嵌套路径，防路径穿越）
  - `POST /api/live2d/open-folder`：用资源管理器打开模型目录
- desktop：
  - 渲染层抽象 `PetRenderer` 接口；sprite（M9 引擎原样搬移）/ live2d（pixi）两实现
  - 模式 `pet-mode`、模型 `pet-live2d-model` 存 localStorage + Tauri `emit('pet-mode'/'pet-model')` 跨窗同步（沿用 pet-size 模式）
  - 调试覆写：`#/pet?mode=live2d&model=Hiyori` 可在纯浏览器直接预览
  - 设置页：引擎二选 + 模型下拉 + 刷新列表 + 打开模型文件夹 + 无模型指引

## 4. 产出

| 文件 | 说明 |
|------|------|
| `server/src/routes/live2d.ts` | 模型列表/文件下发/打开文件夹路由 |
| `server/src/index.ts` | 注册路由 |
| `server/data/live2d-models/README.txt` | 模型获取渠道与目录结构说明 |
| `server/data/live2d-models/Hiyori/` | Live2D 官方免费示例模型（测试+开箱即用） |
| `server/verify-m12.ps1` | 路由端到端验证脚本 |
| `desktop/src/pet/renderers/types.ts` | `PetRenderer` 接口 + 模式常量 |
| `desktop/src/pet/renderers/sprite.ts` | M9 条带引擎（行为零变化，仅搬移） |
| `desktop/src/pet/renderers/live2d.ts` | pixi.js 6.5 + pixi-live2d-display 0.4.0（cubism4 + cubism2 双入口）渲染器 |
| `desktop/src/pages/PetPage.tsx` | 双模式接线；事件监听加 isTauri 守卫（修浏览器白屏） |
| `desktop/src/pages/SettingsPage.tsx` | PetSection 引擎切换 + 模型选择 |
| `desktop/src/api/client.ts` | `listLive2dModels` / `openLive2dFolder` |
| `desktop/public/live2dcubismcore.min.js` | Cubism Core Web runtime（Cubism 3~5，官方 CDN vendor） |
| `desktop/public/live2d.min.js` | Cubism 2 core（老 .moc 模型用） |
| `desktop/package.json` | +pixi.js@6.5.10 +pixi-live2d-display@0.4.0 +@pixi/*@6.5.10 显式锁版 |

动作映射：`hop()`→尝试动作组 TapBody/Tap/FlickHead/Idle；`spin()/flinch()`→canvas CSS 变换；`lookAt()`→每帧 `model.focus()`。

## 5. 实现方案

- **渲染层与 UI 解耦**：气泡/聊天/右键菜单/拖拽都是 canvas 之上的 DOM，完全不动；渲染循环抽成 `PetRenderer`，PetPage 按模式实例化，切换时 dispose 重建。
- **模型加载**：前端用 server 绝对 URL（Tauri webview 源 tauri.localhost，相对路径会 404）；pixi-live2d-display 按 model3.json URL 自动解析相对贴图路径，天然兼容 `/api/live2d/files/:dir/*` 路由。
- **Cubism 2 兼容（M12 追加）**：扫描接口同时识别 `*.model3.json`（Cubism 3~5）与 `model.json`（Cubism 2），返回 `format` 字段；渲染器按 format 注入对应 core（cubismcore / live2d.min.js）并加载对应入口（`pixi-live2d-display/cubism4` | `/cubism2`）。老游戏提取模型（崩坏学园2 等）可用。
- **canvas 上下文互斥**：2d（sprite）与 webgl（pixi）不能共用一个 canvas 元素 → canvas 加 `key={mode-modelName}` 强制重建；pixi `destroy(false)` 不移除 view（归 React 管）。
- **版本锁定**：pixi-live2d-display 0.4.0 peer 要求 @pixi/*@^6，pnpm 会误解析到 7.4.3（混入 pixi6 运行时直接崩）→ desktop 显式安装 @pixi/*@6.5.10 六件套锁死。
- **License**：Cubism Core / 模型均为个人自用（本项目非商业发布）；core runtime 原样 vendor 不修改；仓库不捆绑任何第三方版权模型（Hiyori 为 Live2D 官方免费示例）。

## 6. 遇到的报错及解决方案

| 报错/问题 | 原因 | 解决方案 |
|-----------|------|----------|
| 每帧 `Cannot read properties of undefined (reading 'transformCallback')` 之一 | 误以为是 pixi 版本混装，实为**纯浏览器无 `__TAURI_INTERNALS__`**，PetPage 的 `listen()` 在 effect 同步抛错导致 React 整树卸载（白屏，M9 起就存在的隐藏 bug） | 三处 listen effect 加 `isTauri` 守卫，顺带让 #/pet 可在浏览器调试 |
| 真正的 pixi 混装（lib 用 @pixi/*@7.4.3 + pixi.js@6.5.10，console 出现 "Deprecated since v7.3.0"） | pnpm auto-install-peers 把 lib 的 peer @pixi/* 解析成 7.4.3 | desktop 显式 `pnpm add @pixi/core@6.5.10` 等六件套，锁死单一 6.5.10 实例 |
| canvas 元素从 DOM 消失、画面空白 | StrictMode 双跑：被 cancel 的 effect#1 的 in-flight `start()` 完成后走 `r.dispose()` → pixi `destroy(true)` 移除共享 canvas；effect#2 渲染到已脱离 DOM 的 canvas | pixi `destroy(false)`（不移除 view）；PetPage 在 `start()` 前加 `cancelled` 检查，被 cancel 就不再创建 renderer |
| pnpm 11 不读 package.json 的 `pnpm.overrides` | 新版本配置迁移到 pnpm-workspace.yaml | 弃用 overrides，改显式依赖锁版（更直观） |
| PowerShell 5.1 `Invoke-WebRequest` 请求流式二进制响应抛 NullReferenceException | PS 5.1 IWR 对 chunked/二进制响应的解析 bug | verify-m12.ps1 二进制请求改用 curl.exe |
| GitHub raw 下载大文件超时/截断 | 网络慢 | 用 ghfast.top 镜像 + 逐个校验文件大小 |
| PS 5.1 `Out-File -Encoding utf8` 带 BOM 导致 JSON 断言失败 | BOM 头 | 改用 `[System.IO.File]::WriteAllText` |

## 7. 验证记录

- `server/verify-m12.ps1`（测试实例 PORT=3211）：列表 ✓ / model3.json 下发 ✓ / 嵌套贴图 200 image/png ✓ / 路径穿越 400 ✓ / 不存在 404 ✓ —— **M12 VERIFY ALL PASS**
- 端到端渲染：vite dev + puppeteer-core 驱动 Edge headless 打开 `http://127.0.0.1:1420/#/pet?mode=live2d&model=Hiyori` → 截图确认 Hiyori 完整渲染（贴图/物理加载成功，底部对齐）
- 对照组 `#/pet`（sprite 模式）canvas 正常
- `pnpm --filter desktop build` 0 错误；`pnpm --filter server build` 0 错误
- 追加 Cubism 2：bronya（崩坏学园2，.moc + model.json）headless 实测渲染 ✓；模型列表接口返回 26 个模型（cubism4 ×7 + cubism2 ×19）
