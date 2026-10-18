# 模块：公共 Live2D 资源

> 状态：✅ 稳定
> 最近更新：2026-09-26

## 摘要
内置 Live2D 模型作为 Remainder 的公共资源：只要用户注册成功，就可以在桌宠中使用这些模型，不需要每个用户单独上传或同步一份模型文件。

## 动机
用户要求“内置 Live2D 模型只要用户注册就开放给用户”。这些模型属于应用公共能力，不应占用用户私有数据空间，也不应因多设备同步重复传输。

## 范围与非范围
- 范围内：公共模型注册表、只读资源 API、桌面端模型列表、模型版本和缓存。
- 明确不做：用户私有模型的跨设备同步；用户自上传模型继续作为私有附件处理。

## 上下游依赖
- 上游：`server/data/live2d-models/` 或打包资源、账号认证。
- 下游：`desktop/src/pet/renderers/live2d.ts`、Live2D 模型列表 API。

## 关键接口与运行时信息
- 关键文件：`server/src/routes/live2d.ts`、`desktop/src/pages/PetPage.tsx`、`desktop/src/pet/renderers/live2d.ts`。
- API：`GET /api/live2d/models`、`GET /api/live2d/files/:dir/*`。
- 资源策略：所有已登录用户可读；公共资源不写入用户变更队列。
- 验证：注册账号后模型列表非空；不同账号看到相同内置模型；私有附件仍按账号隔离。

## 设计决策与假设
- 内置模型只读、版本化、全局共享，按模型目录缓存。
- 不把 Hiyori/BYC/Kiana/Kiro/Lita/Nina/Nindi/bronya 等内置目录复制进每个用户空间。
- 版权和许可继续按各模型 README/来源执行。

## Bug 与问题记录
### BUG-001 公共模型 URL 硬编码本机地址（2026-09-26，已解决）
- 错误行为：WHEN 应用通过域名或反向代理访问 THEN 模型 URL 仍指向 `127.0.0.1`。
- 期望行为：WHEN 服务端返回模型列表 THEN 系统 SHALL 返回当前部署可访问的 URL。
- 不可破坏的行为：WHEN 本地模式访问 THEN 系统 SHALL CONTINUE TO 使用本机服务地址。
- 根因：`live2d.ts` 构造 URL 时固定使用 `config.port`。
- 解决方式：读取 forwarded host/proto，缺失时回落到请求 Host。
- 验证方式：构建 + M36 验证脚本检查两个注册账号的公共模型列表。

## 验证记录
- `node server/verify-m36.mjs`：owner 与邀请注册用户拿到相同非空模型列表。
- 模型仍从全局 `packaging/live2d-models` / `server/data/live2d-models` 读取，不复制到用户 owner 数据。

## 报错及解决方案

| 报错/问题 | 原因 | 解决方案 |
|---|---|---|
| 云端模型 URL 可能仍指向 `127.0.0.1:3210` | 模型列表硬编码本机 API 地址 | 优先使用 `X-Forwarded-Proto/Host`，回落到请求 Host |
| 新注册用户是否拿到内置模型无法回归保护 | 原验证只验证单账号列表 | `verify-m36.mjs` 邀请新用户并比较两个账号模型名列表 |

## 已知限制与待办
- [x] 注册用户共享内置模型且不复制到用户空间
- [ ] 公共资源缓存策略
- [ ] 用户私有模型上传
