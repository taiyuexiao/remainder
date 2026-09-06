// 用 stdio 模拟 MCP 客户端，调用 kb_search 验证 mcp-server 与 Remainder API 的连通
import { spawn } from 'node:child_process';

const server = spawn('node', ['index.mjs'], {
  cwd: import.meta.dirname,
  stdio: ['pipe', 'pipe', 'inherit'],
});

let buf = '';
const pending = new Map();
let idSeq = 1;

server.stdout.on('data', (chunk) => {
  buf += chunk.toString();
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    } catch { /* ignore */ }
  }
});

const send = (method, params) =>
  new Promise((resolve) => {
    const id = idSeq++;
    pending.set(id, resolve);
    server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });

// MCP 握手
await send('initialize', {
  protocolVersion: '2024-11-05',
  capabilities: {},
  clientInfo: { name: 'test-client', version: '0.1' },
});
server.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

// 建测试条目
await fetch('http://127.0.0.1:3210/api/knowledge', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'note', title: 'MCP 连通测试条目', content: 'rembg 抠图要指定 u2net 模型', tags: ['mcp-test'] }),
}).then((r) => r.json());

// 列工具
const tools = await send('tools/list', {});
console.log('[1] tools:', tools.result.tools.map((t) => t.name).join(', '));

// kb_search
const search = await send('tools/call', { name: 'kb_search', arguments: { query: 'rembg 抠图' } });
console.log('[2] kb_search:', search.result.content[0].text.slice(0, 120).replace(/\n/g, ' | '));

// 清理
const items = await fetch('http://127.0.0.1:3210/api/knowledge?tag=mcp-test').then((r) => r.json());
for (const it of items) await fetch(`http://127.0.0.1:3210/api/knowledge/${it.id}`, { method: 'DELETE' });
console.log('[3] cleanup done');

server.kill();
process.exit(0);
