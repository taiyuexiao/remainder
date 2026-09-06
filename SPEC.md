# SPEC — M23 团队知识库（方案 v2 之 K1 阶段）

> 依据：`docs/research/团队知识共享平台方案v2-融合版.md`

## 范围（本次做）

1. **内容模型**：知识条目七类型（intel/share/note/rfc/guide/spec/adr）+ 完整 schema（author/owners/channels/tags/ttl/status/acl/notify/related）
2. **四层呈现**：快讯流（话题流+TTL沉底）/ 探讨区（问答卡片+结论回填）/ 经验库（卡片流+过滤+搜索）/ 工作库（复用文档模块，条目标记关联）
3. **沉淀双入口（人发起）**：剪藏箱/Inbox 一键沉淀为条目（LLM 一键改写可选）
4. **agent 读取**：MCP stdio server v1（kb_search/kb_get/kb_list_recent）
5. **联机能力**：server 监听地址可配（HOST env）+ 共享 token 认证（TEAM_TOKEN env，仅非回环地址时强制）；desktop 的 API 地址 + token 可在设置页配置
6. **digest**：邮件日报加「今日知识库动态」一节

## 非目标（本次不做）

- 联机 UI 的完整引导（仅提供配置能力，不做配对向导）
- agent 草稿闭环（kb_submit_draft / drafts 人审）→ K2
- P0 规则引擎（spec/adr 变更必达下游）→ K2
- git 镜像导出 → K3
- kb_constraints / kb_who_knows → K3
- 探讨区的完整问答交互（v1 只做"有结论"标记 + 结论回填）

## 约束

- 复用现有资产：FTS5（trigram 中文）/ Tiptap / 剪藏 convert 管线 / 邮件日报通道 / settings API
- server 现有路由风格（Fastify + better-sqlite3 + helpers.now/uuid/localDate）
- 单机默认体验零变化（不配 HOST/TOKEN 时行为与现在完全一致）

## 验收标准

1. verify-m23.ps1：条目 CRUD/过滤/TTL 沉底/搜索/token 认证全过
2. desktop build 0 错误；知识库页四层可用；剪藏/Inbox 能一键沉淀
3. MCP server 能被 Claude Code 等 agent 配置使用（stdio），kb_search 返回合成答案+出处
4. 不配 HOST/TOKEN 时单机行为与之前一致
5. 日报邮件含「今日知识库动态」节
