# Remainder 项目总览

> 本文件是项目文档的入口：先读这里，再按需读 `docs/modules/` 下的模块文档。
> 更新纪律：每完成一个模块或处理一个变更，当轮更新「变更日志」和受影响的索引条目。

## 一句话说明
Remainder 是本地优先的任务规划、文档、知识库与 AI 助手平台，现在增加多用户账号、云端数据归属和多设备增量同步。

## 技术栈与关键约定
- `server/`：Fastify 5 + TypeScript + better-sqlite3；云端部署使用 PostgreSQL + 对象存储，迁移期间保留 SQLite 兼容层。
- `desktop/`：Tauri 2 + React 18 + Vite 6 + Tailwind 4 + Tiptap 2。
- `clipper/`：Manifest V3 浏览器扩展。
- 账号：邮箱/用户名 + 密码，Argon2id 哈希；首个管理员 `spl`，后续邀请码注册。
- 数据隔离：个人空间按账号隔离；团队空间按 `team_id` 隔离；同步以业务记录和附件为单位，不把原始 `.db` 当同步协议。
- 同步：断网本地可用，联网后变更队列重放；同一记录 last-write-wins，保留冲突审计。
- 公共资源：内置 Live2D 模型对所有注册用户开放，不复制到用户私有数据。
- 红线：首次迁移必须先备份本地数据；云端一致性校验通过前不得覆盖或删除本地数据。

## 模块索引
| 模块 | 文档 | 状态 | 一句话摘要 |
|---|---|---|---|
| 账号与多用户隔离 | [modules/M36-账号与多用户隔离.md](modules/M36-账号与多用户隔离.md) | 🚧 | 认证基础已落地，业务查询隔离继续开发 |
| 数据迁移与增量同步 | [modules/M37-数据迁移与增量同步.md](modules/M37-数据迁移与增量同步.md) | 🚧 | 本地数据一次性导入 `spl`，后续多设备记录级同步 |
| 云端部署与安全 | [modules/M38-云端部署与安全.md](modules/M38-云端部署与安全.md) | 🚧 | Docker Compose、HTTPS、数据库、对象存储、备份 |
| 公共 Live2D 资源 | [modules/M39-公共Live2D资源.md](modules/M39-公共Live2D资源.md) | ✅ | 注册用户默认可用内置模型，不进入私有同步 |

## 变更日志
| 日期 | 类型 | 摘要 | 涉及模块 |
|---|---|---|---|
| 2026-10-02 | 修复 | 中文输入法确认候选词的回车误触发提交（WebKit compositionend 先于 keydown），新增 `useImeGuard` 统一守卫速记/AI 助手/桌宠/Inbox/任务等 7 个输入入口；重编 0.2.7 替换安装目录（用户此前跑的是 0.2.6 旧包所以首轮"没变化"） | M22 |
| 2026-10-02 | 部署 | 安装目录 server 同步到 M36 代码（备份 dist.bak-20261002）：0.2.7 前端启动探测 /api/auth/me，旧 server 无此路由会误弹登录页；本地回环模式自动以 spl 身份运行，无需密码 | M36 |
| 2026-10-06 | 修复 | 「唤回桌宠」点击无效：capabilities 缺 `core:window:allow-get-all-windows`（getAllWindows 被静默拒绝），补权限后重编 0.2.8 替换安装目录；同修桌宠"打开主窗口"与 WidgetPage 同类调用 | M12 |
| 2026-10-06 | 运维 | Mac 重启后 server 不会自启（nohup 跟会话走），第三次踩坑后配置 LaunchAgent `com.remainder.server`（~/Library/LaunchAgents，RunAtLoad+KeepAlive），登录自动拉起、崩溃自动重启 | - |
| 2026-09-26 | 规划 | 收敛多用户账号、云端迁移、增量同步、离线队列和公共资源方案 | M36-M39 |
| 2026-09-26 | 新增 | 账号 schema、登录/token/邀请码、桌面登录页；本地 `spl` 已创建 | M36 |
| 2026-09-26 | 新增 | 注册用户共享内置 Live2D 列表，资源 URL 支持云端反代 | M39 |
| 2026-09-26 | 新增 | Docker Compose/Caddy 部署骨架，等待云服务器部署 | M38 |

## 关键问题与解决
- 当前 `server/data/` Git 同步是整库 last-write-wins，不适合作为多用户云同步协议；保留为本地迁移来源和备份格式。
- 当前数据库已备份并通过一致性校验：`/Users/shipeilin/Applications/Remainder/backups/remainder-20260926-191449.db`。
- 当前数据目录全量归档：`/Users/shipeilin/Applications/Remainder/backups/remainder-data-20260926-192633.tar.gz`。
- 腾讯云服务器 80 端口已有其他业务，部署 Remainder 必须使用域名/子域名或独立端口，不能覆盖现有 Caddy。

## 待处理 / 后期处理
- [x] 实现账号表、认证 API、首个管理员 `spl`
- [ ] 补全所有业务表的查询/写入 owner 隔离
- [ ] 实现 `spl` 一次性迁移和云端一致性验收
- [ ] 实现业务记录增量同步、附件上传和离线变更队列
- [ ] 配置腾讯云 Docker Compose、HTTPS、PostgreSQL、对象存储和备份
- [x] 内置 Live2D 模型接入公共资源服务
- [ ] 邮件验证、密码找回、开放注册（当前暂缓）

## 可参考的类似项目
- Supabase/Nextcloud：账号、对象存储、同步和自托管部署模式
- SQLite session/changeset：增量变更与冲突审计的协议参考

## 后续优化方向
- 逐字段合并、文档协同编辑、端到端加密
- 多节点团队空间和更细粒度 ACL
