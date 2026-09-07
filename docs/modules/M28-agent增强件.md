# M28 agent MCP 增强件（kb_constraints / kb_who_knows / kb_submit_draft）

> 来源：`docs/0905.md` §MCP 工具表 + v2 方案 K3 排队项。把知识库从"agent 只能读"补齐到"查红线 / 找人 / 自动沉淀草稿"。

## 实现

### server（`routes/knowledge.ts` 新增两端点）

- `GET /api/knowledge/constraints?team=&module=`：聚合该主题的 spec + adr（status active/concluded），**adr 置顶**（adr 否决项是硬约束）。标题/正文/标签/频道 LIKE 匹配
- `GET /api/knowledge/who-knows?team=&topic=`：全文检索命中条目后按 author + owners 聚合统计（条目数/负责条数/涉及类型），按负责数排序——回答"这事问谁"
- 草稿可见性：`knowledgeSearch` 默认过滤器从 `status IN (?, 'open')` 扩为 `IN (?, 'open', 'draft')`——agent 草稿浮到列表待人审（draft 状态 v11 schema 已预留）

### MCP server（`mcp-server/index.mjs`，工具 3→6）

- `kb_constraints(module, team?)`：返回约束列表，adr 标 ⚠️，提示用 kb_get 取全文
- `kb_who_knows(topic, team?)`：返回人员分布排行
- `kb_submit_draft(type, title, content, channel?, tags?, team?)`：POST 条目 status=draft，author 记为「<用户名> 的 agent」

### 桌面端（KnowledgePanel）

- 卡片：draft 条目带琥珀色虚线「草稿」徽章
- 详情侧栏：draft 顶部横幅「agent 提交的草稿，确认后转正入库」+「✓ 确认转正」按钮（PATCH status=active）

## 报错及解决方案

本次无新增坑（全程复用 M24–M27 的教训：ps1 纯 ASCII、端口实例验明 pid、@() 数组断言）。

## 验证

- `server/verify-m28.ps1` 六步全绿（spec/adr 聚合并 adr 置顶 / who-knows alice 居首 / draft 入默认列表 / 确认转正 / MCP stdio 握手 tools/list 含全部 6 工具）
- `pnpm --filter server build` + `pnpm --filter desktop build` 0 错误
