# M7 Web 端构建与部署

## 1. 任务背景
桌面端与 Web 端共用同一套 React 代码。M7 的目标是把同一套代码构建为可在浏览器访问的静态 Web 应用，并说明如何切换后端 API 地址。

## 2. 目标
- 同一套 `desktop/` 代码可通过环境变量切换 API 地址后构建 Web 版
- 构建产物 `desktop/dist/` 可用任意静态服务器或 `vite preview` 部署

## 3. 需求
- Web 构建命令：`pnpm --filter desktop build:web`
- API 地址通过 `VITE_API_BASE` 注入（默认 `http://127.0.0.1:3210`，开发/本地桌面用）
- 提供示例环境文件 `.env.web.example`
- 部署文档说明：拷贝 dist/ 到 Nginx/Caddy/对象存储，或 `pnpm preview`

## 4. 产出
- `desktop/package.json`：新增 `build:web` 脚本（与 build 等价，语义区分）
- `desktop/.env.web.example`：Web 构建环境变量示例
- `docs/modules/M7-Web端.md`：本文件

## 5. 实现方案
Vite 的 `import.meta.env.VITE_API_BASE` 在构建时被静态替换，因此 Web 版只需在构建前注入 `VITE_API_BASE=https://your-server`。构建产物零后端依赖，纯静态。

## 6. 遇到的报错及解决方案
| 报错/问题 | 原因 | 解决方案 |
|-----------|------|----------|
| 无 | — | — |

## 7. 验证记录
- 执行 `$env:VITE_API_BASE='https://api.remainder.example.com'; pnpm build:web` → 成功 ✅
- 检查 `dist/assets/*.js` 包含 `api.remainder.example.com` → 已注入 ✅
- `pnpm preview -- --port 4173 --host 127.0.0.1` → `http://127.0.0.1:4173` 返回 200 ✅
