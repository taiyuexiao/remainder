# M20 macOS 桌面层小组件

## 1. 任务背景

小组件（widget 窗口）此前只在 Windows 上嵌入桌面层（Win32 `SetParent` 挂 Progman/WorkerW，
见 `desktop_layer::stick_to_desktop`）；macOS/Linux 分支降级为 `set_always_on_top(true)` 的
置顶悬浮窗，遮挡正常窗口，不是桌面组件形态。本模块补齐 macOS 的桌面层实现，让 Mac 上的
小组件与 Windows 行为一致：壁纸与桌面图标之上、所有应用窗口之下。

## 2. 目标

1. macOS 上小组件窗口贴在桌面层，打开其他应用窗口时组件被压在下面而不是浮在最上
2. 组件在所有 Space（虚拟桌面）可见，调度中心（Mission Control）里不移动
3. Windows 行为零回归；Linux 等无桌面层 API 的平台保持原悬浮降级

## 3. 需求

- 输入：无（应用启动时 setup 钩子自动执行）
- 输出：widget 窗口 `NSWindow.level` = 桌面层，`collectionBehavior` = 全 Space + 驻留 + 不参与窗口循环
- 边界：小组件 `focusable: false`（tauri.conf.json），压到桌面层后仍可接收鼠标点击，不会抢焦点

## 4. 产出

- `desktop/src-tauri/src/main.rs`：新增 `#[cfg(target_os = "macos")] mod desktop_layer`
  （`stick_to_desktop(&WebviewWindow)`）；setup 钩子拆为 Windows / macOS / 其他 三个平台分支
- `desktop/src-tauri/Cargo.toml`：新增 `[target.'cfg(target_os = "macos")'.dependencies] objc = "0.2"`

## 5. 实现方案

macOS 没有 Win32 桌面层，等价物是 CoreGraphics 窗口层级（window level）：

- `NSWindow.level = CGWindowLevelForKey(kCGDesktopWindowLevelKey) + 2`
  （= INT32_MIN + 22）。`kCGDesktopWindowLevel` 在壁纸之上、桌面图标之下；+2 压过
  Finder 桌面图标层，但仍远低于普通窗口（level 0），对齐 Windows 端"图标之上、应用之下"
- `NSWindow.collectionBehavior = canJoinAllSpaces | stationary | ignoresCycle`
  （1|16|64 = 81）：所有 Space 可见、Mission Control 不移动、Cmd+Tab/窗口循环不出现

通过 Tauri2 `WebviewWindow::ns_window()` 拿到 `NSWindow*`，用 `objc` crate 的
`msg_send!` 调 `setLevel:` / `setCollectionBehavior:`，无需引入 objc2 全家桶。

桌宠（pet 窗口）保持原有置顶悬浮不变（桌宠本就需要在最上层）。

## 6. 遇到的报错及解决方案

| 报错/问题 | 原因 | 解决方案 |
|-----------|------|----------|
| Mac 便携包首次启动"无法连接后端服务" | 便携 zip 里 `server/node_modules` 为空，后端缺 fastify 起不来 | 在包内 `server/` 用内置 node 执行 npm install --omit=dev 补齐依赖 |
| `better_sqlite3.node` ERR_DLOPEN_FAILED：NODE_MODULE_VERSION 147 vs 127 | 用系统 node 26 跑 npm install，原生模块编成 node 26 的 ABI，与包内置 node 22 不符 | 用包内置 node 执行 prebuild-install，拉取匹配 node 22 ABI 的预编译二进制 |
| `data-sync.mjs pull` 报 `curl 56 Recv failure: Connection reset by peer` | 网络抖断（GitHub 直连不稳定） | 重试即恢复；大数据目录建议分批提交推送（M19 bootstrap 已解决） |

## 7. 验证记录

- `pnpm --filter desktop build`：0 错误
- `pnpm tauri build`（macos）：0 错误，产出 `desktop/src-tauri/target/release/bundle/macos/Remainder.app`
- 实机运行 mac 版：小组件位于桌面层 —— 聚焦/切换其他应用窗口后组件被压在窗口之下，
  点击桌面可见区域组件正常响应，调度中心切换 Space 组件驻留不动
- Windows 回归：CI windows-latest 构建通过（分支代码未改动 Windows 路径，`cfg` 隔离）
