# PLAN — M23 团队知识库（K1）

> 每步完成验证后再进行下一步。

## Step 1：server 数据层
- `server/src/db/schema.ts`：v11 迁移 `knowledge_items` 表 + `knowledge_fts`（trigram external content）
- `server/src/services/knowledgeSearch.ts`：rebuildKnowledgeFts + searchKnowledge（复用 docSearch 模式）
- 验证：`pnpm --filter server build` 0 错误

## Step 2：server 路由
- `server/src/routes/knowledge.ts`：CRUD + 列表过滤（type/channel/tag/status/未沉底）+ POST /:id/conclude（rfc 结论回填）
- `server/src/index.ts`：注册
- 验证：build + 手动 curl 建条目/列表/搜索

## Step 3：联机能力
- `server/src/config.ts`：+host（HOST env，默认 127.0.0.1）+ teamToken（TEAM_TOKEN env）
- `server/src/index.ts`：listen 用 config.host；非回环时全局 hook 校验 `x-team-token`
- `desktop/src/api/client.ts`：API 从 localStorage('api-base') 读，默认 127.0.0.1:3210；req 附带 x-team-token（localStorage('team-token')）
- `desktop/src/pages/SettingsPage.tsx`：新增「联机」区块（节点地址 + token 输入，存 localStorage + server settings）
- 验证：build 0 错误；非回环+无 token 401、带 token 200

## Step 4：desktop 知识库页
- `desktop/src/pages/KnowledgePage.tsx`：四层 tab（快讯/探讨/经验/工作库）+ 条目卡片列表 + 新建/编辑表单 + 详情 + 删除
- `desktop/src/App.tsx`：导航加「📚 知识库」
- `desktop/src/api/client.ts`：知识条目 API 方法
- 验证：build + e2e 建条目/切换层/搜索

## Step 5：沉淀入口
- 剪藏箱（ClipsPage）：条目卡片加「沉淀」按钮（选类型 → 建条目，关联原文档）
- InboxPage：条目加「沉淀到知识库」按钮
- 验证：e2e 剪藏→沉淀→经验库可见

## Step 6：digest 集成
- `server/src/scheduler/`（日报生成处）：加「今日知识库动态」节（今日新建条目按频道聚合）
- 验证：curl 触发日报生成，内容含该节

## Step 7：MCP server v1
- `server/mcp-server/`：`index.mjs`（@modelcontextprotocol/sdk，stdio）+ package.json + README
- 工具：kb_search / kb_get / kb_list_recent；走 Remainder HTTP API（env REMAINDER_API / REMAINDER_TOKEN）
- 验证：node 起 mcp-server，MCP inspector 或脚本调用三个工具

## Step 8：收尾
- `server/verify-m23.ps1`
- 双端 build + 重编 exe
- `docs/modules/M23-团队知识库.md`（按 TEMPLATE.md）
- 更新 PRD（知识库节一句话）+ 本 PLAN 勾销
