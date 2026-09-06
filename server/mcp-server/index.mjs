#!/usr/bin/env node
/**
 * Remainder 知识库 MCP server（M23）
 * stdio 传输，供 coding agent（Claude Code / Cursor / Kimi CLI 等）配置使用。
 * 通过 HTTP 读 Remainder 知识库 API。
 *
 * 环境变量：
 *   REMAINDER_API    Remainder server 地址（默认 http://127.0.0.1:3210；联机时填团队节点）
 *   REMAINDER_TOKEN  团队共享 token（联机模式必填，单机留空）
 *   REMAINDER_USER   我的用户名（M24 团队身份，LAN 信任制；留空=本机用户）
 *   REMAINDER_TEAM   默认团队 id（默认 personal 个人空间；kb_search/kb_list_recent 可用 team 参数覆盖）
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API = process.env.REMAINDER_API ?? 'http://127.0.0.1:3210';
const TOKEN = process.env.REMAINDER_TOKEN ?? '';
const USER = process.env.REMAINDER_USER ?? '';
const DEFAULT_TEAM = process.env.REMAINDER_TEAM ?? 'personal';

async function call(path) {
  const headers = { 'Content-Type': 'application/json' };
  if (TOKEN) headers['x-team-token'] = TOKEN;
  if (USER) headers['x-user-name'] = encodeURIComponent(USER);
  const res = await fetch(`${API}${path}`, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Remainder API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

const fmt = (it) =>
  `[${it.type}] ${it.title}\n  作者:${it.author || '—'} 频道:${it.channels} 标签:${it.tags} 更新:${(it.updated_at ?? '').slice(0, 10)}${it.expires_at ? ` 沉底:${it.expires_at.slice(0, 10)}` : ''}\n  id: ${it.id}`;

const server = new McpServer({
  name: 'remainder-knowledge',
  version: '0.1.0',
});

server.tool(
  'kb_search',
  '搜索团队知识库（经验/规范/契约/决策/快讯）。返回合成列表+出处 id，用 kb_get 取全文。',
  {
    query: z.string().describe('检索词（中文可，≥3字走全文索引）'),
    type: z.enum(['intel', 'share', 'note', 'rfc', 'guide', 'spec', 'adr']).optional().describe('按类型过滤'),
    channel: z.string().optional().describe('按频道过滤（backend/frontend/infra/product/ai-intel/learning/general）'),
    team: z.string().optional().describe('团队 id（默认 REMAINDER_TEAM 或 personal）'),
  },
  async ({ query, type, channel, team }) => {
    const params = new URLSearchParams({ q: query, team: team ?? DEFAULT_TEAM });
    if (type) params.set('type', type);
    if (channel) params.set('channel', channel);
    const items = await call(`/api/knowledge?${params}`);
    if (!items.length) {
      return { content: [{ type: 'text', text: `没有找到与「${query}」相关的知识条目。` }] };
    }
    const text = `找到 ${items.length} 条：\n\n` + items.map(fmt).join('\n\n');
    return { content: [{ type: 'text', text }] };
  },
);

server.tool(
  'kb_get',
  '取知识条目全文（先过 acl/TTL 检查）',
  { id: z.string().describe('条目 id（kb_search 返回的 id）') },
  async ({ id }) => {
    const it = await call(`/api/knowledge/${id}`);
    if (it.acl === 'private') {
      return { content: [{ type: 'text', text: '该条目为 private 权限，不可读取。' }] };
    }
    if (it.expires_at && new Date(it.expires_at) < new Date()) {
      return { content: [{ type: 'text', text: `⚠ 该条目已于 ${it.expires_at.slice(0, 10)} 过期（内容可能失效）：\n\n${it.content}` }] };
    }
    let text = `# ${it.title}\n\n类型:${it.type} 作者:${it.author || '—'} 标签:${it.tags}\n${it.source_url ? `来源:${it.source_url}\n` : ''}\n${it.content}${it.conclusion ? `\n\n结论：${it.conclusion}` : ''}`;
    // M26：附评论摘要（agent 可读）
    try {
      const comments = await call(`/api/knowledge/${id}/comments`);
      if (comments.length) {
        text += `\n\n评论（${comments.length} 条）：\n` + comments
          .map((c) => `- ${c.author}（${(c.created_at ?? '').slice(0, 10)}）：${c.content}`)
          .join('\n');
      }
    } catch { /* 评论拉取失败不阻塞正文 */ }
    return { content: [{ type: 'text', text }] };
  },
);

server.tool(
  'kb_list_recent',
  '列某频道最近 N 天的新条目（看团队最近在沉淀什么）',
  {
    channel: z.string().optional().describe('频道（留空=全部）'),
    days: z.number().optional().describe('最近几天（默认 7）'),
    team: z.string().optional().describe('团队 id（默认 REMAINDER_TEAM 或 personal）'),
  },
  async ({ channel, days = 7, team }) => {
    const params = new URLSearchParams({ team: team ?? DEFAULT_TEAM });
    if (channel) params.set('channel', channel);
    const items = await call(`/api/knowledge?${params}`);
    const cutoff = Date.now() - days * 86400000;
    const recent = items.filter((it) => new Date(it.created_at).getTime() >= cutoff);
    if (!recent.length) {
      return { content: [{ type: 'text', text: `最近 ${days} 天${channel ? `频道 ${channel} ` : ''}没有新条目。` }] };
    }
    const text = `最近 ${days} 天${channel ? `频道 ${channel} ` : ''}共 ${recent.length} 条：\n\n` + recent.map(fmt).join('\n\n');
    return { content: [{ type: 'text', text }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
