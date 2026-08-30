# M9 AI 桌宠（蕾米埃尔）

## 1. 任务背景
用户想要精致、可自定义的桌宠（动漫角色陪伴）。调研结论：Live2D 有 license 红线（可换肤应用不适用免费豁免）、3D VRM 精致但工作量与 GPU 开销大（记入 TECH 暂存项，二期补）、精灵图/立绘 + 程序化动画是最优解。角色素材用用户提供的绝区零蕾米埃尔·丹海报（本地自用）。

## 2. 目标
- 静态立绘"活起来"：呼吸/摇晃/视线跟随/跳跃，不做呆滞静态图（眨眼因无法精确操作眼区而放弃）
- 崩三式分区互动：摸头 / 点胸害羞 / 身体通用；双击聊天；右键娱乐模式
- 任务到期提醒由桌宠呈现（跳跃 + 气泡）

## 3. 需求
- 素材：海报 → 裁切 → rembg(u2net) 抠图 → 透明底立绘 PNG（717x1027）
- 窗口：Tauri 透明无边框置顶窗，右下角锚定，三档尺寸（小 140x200 默认 / 中 / 大），设置页调节 + localStorage 记忆 + Tauri event 跨窗即时生效
- 动画：Canvas 条带扭曲引擎（48 条带），呼吸（3.6s 周期纵向微缩放）、摇晃（6.2s 微旋转）、视线跟随（头部条带视差，鼠标趋近平滑）、跳跃（挤压拉伸 550ms）、转圈（700ms 360°）、害羞闪躲（快速抖动+脸红 overlay）
- 交互：单击分区（头 <32% / 胸 42-62% / 其他）、双击聊天框、右键娱乐模式菜单（mousedown 即关菜单修复拖拽吞 click 的 bug、Esc 关闭）
- 对话：POST /api/llm/chat（蕾米埃尔人格 prompt），未配 LLM key 时罐头回复兜底

## 4. 产出
- `desktop/src/pages/PetPage.tsx`（动画引擎 + 全部交互）
- `desktop/src/assets/pet/remielle.png`（抠图立绘）
- `pet-cutout.py` / `pet-fix.py`（素材处理脚本，venv `.venv-pet`）
- `desktop/src-tauri`：pet 窗口配置、右下角定位、capabilities 补 set-size/set-position/current-monitor/event 权限
- `server/src/llm/index.ts`：petChat；`server/src/routes/llm.ts`：/api/llm/chat
- `desktop/src/pages/WidgetPage.tsx`：通知到达时 emit('pet-reminder')
- `desktop/src/pages/SettingsPage.tsx`：PetSection（大小三档 + 唤回桌宠）

## 5. 实现方案
- 眨眼放弃的原因：立绘是整张 JPG 抠图，眼区无法精确分离操作，粗仿（眼皮色覆盖）效果怪异，用户体验差
- 点击区域按 canvas 相对高度划分；单击/双击用 260ms timer 区分
- 菜单关不掉的 bug 根因：canvas 的 startDragging 吞掉 click 事件导致外层 onClick 不触发 → 改为 onMouseDown 关菜单
- 跨窗通信：Tauri event bus（widget 提醒 → pet 跳跃气泡；settings 大小 → pet resize）

## 6. 遇到的报错及解决方案
| 报错/问题 | 原因 | 解决方案 |
|-----------|------|----------|
| rembg 模型下载连接被拒 | GitHub releases 直连被断 | ghfast.top 镜像下载 u2net.onnx 到 ~/.rembg/models |
| rembg 2.x 默认用 bria-rmbg 大模型 | 默认模型变更 | new_session("u2net") 显式指定 |
| 抠图残留暗色块 | 海报阴影被识别为前景 | numpy 区域暗像素置透明（pet-fix.py） |
| `currentMonitor` 不存在于 Window 类型 | @tauri-apps/api/window 该 API 为顶层导出 | 改用顶层 `currentMonitor()` |
| llm.ts 语法错误（括号不配对） | StrReplaceFile 默认替换首个匹配把 chat 路由插进了 polish 处理器中间 | 读文件修正闭合 |
| `petChat` 找不到 | import 编辑未生效 | 补 import |

## 7. 验证记录
- `pnpm --filter desktop build` / `pnpm --filter server build` → 0 错误 ✅
- /api/llm/chat → 503 + 明确提示（无 key 时）✅，前端落罐头回复 ✅
- `pnpm tauri build` → release exe + MSI/NSIS 安装包 ✅
- 实测项（用户侧）：呼吸/摇晃/视线跟随/摸头/害羞/双击聊天/右键娱乐模式/尺寸三档/提醒跳跃
