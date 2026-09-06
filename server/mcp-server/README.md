# Remainder 知识库 MCP server

给 coding agent（Claude Code / Cursor / Kimi CLI 等）提供团队知识库读取能力。

## 安装

```bash
cd server/mcp-server
pnpm install
```

## 配置到 agent（以 Claude Code 为例）

```bash
claude mcp add remainder-kb -- node "C:/projects/remainder/server/mcp-server/index.mjs"
```

其他 MCP 客户端（Cursor / Kimi CLI 等）配置 stdio server：

```json
{
  "mcpServers": {
    "remainder-kb": {
      "command": "node",
      "args": ["C:/projects/remainder/server/mcp-server/index.mjs"],
      "env": {
        "REMAINDER_API": "http://127.0.0.1:3210",
        "REMAINDER_TOKEN": ""
      }
    }
  }
}
```

联机模式（连团队节点）时填节点的 REMAINDER_API + REMAINDER_TOKEN。

## 工具

| 工具 | 作用 |
|---|---|
| `kb_search(query, type?, channel?)` | 搜索知识条目，返回列表+出处 id |
| `kb_get(id)` | 取条目全文（过 acl/TTL） |
| `kb_list_recent(channel?, days?)` | 列频道最近 N 天新条目 |
