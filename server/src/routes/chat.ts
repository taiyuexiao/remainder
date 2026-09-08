import type { FastifyInstance } from 'fastify';
import { db } from '../db/connection.js';
import { now, uuid, localDate } from './helpers.js';
import { agentReply } from '../llm/agentLoop.js';

interface ConvRow { id: string; title: string; created_at: string; updated_at: string }
interface MsgRow { id: string; conv_id: string; role: string; content: string; actions: string; created_at: string }

const LLM_OFF = 'LLM 未启用或未配置 API Key（请在设置页配置）';

export default async function chatRoutes(app: FastifyInstance) {
  // 会话列表（最近更新在前，带最后一条消息预览）
  app.get('/api/conversations', async () => {
    return db.prepare(
      `SELECT c.*, (SELECT content FROM chat_messages WHERE conv_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message
       FROM conversations c ORDER BY c.updated_at DESC`,
    ).all();
  });

  // 新建会话
  app.post('/api/conversations', async (req, reply) => {
    const id = uuid();
    const ts = now();
    db.prepare('INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?,?,?,?)')
      .run(id, '新对话', ts, ts);
    return reply.code(201).send(db.prepare('SELECT * FROM conversations WHERE id = ?').get(id));
  });

  // 会话详情（含消息）
  app.get('/api/conversations/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as ConvRow | undefined;
    if (!conv) return reply.code(404).send({ error: '会话不存在' });
    const messages = db.prepare(
      'SELECT * FROM chat_messages WHERE conv_id = ? ORDER BY created_at ASC',
    ).all(id) as MsgRow[];
    return { ...conv, messages: messages.map((m) => ({ ...m, actions: JSON.parse(m.actions || '[]') })) };
  });

  // 删除会话
  app.delete('/api/conversations/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const r = db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
    if (r.changes === 0) return reply.code(404).send({ error: '会话不存在' });
    return { deleted: id };
  });

  // 发消息：存用户消息 → LLM（闲聊+动作抽取）→ 应用动作 → 存助手消息
  app.post('/api/conversations/:id/messages', async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as { content?: string };
    if (!b.content?.trim()) return reply.code(400).send({ error: 'content 必填' });
    const conv = db.prepare('SELECT id, title FROM conversations WHERE id = ?').get(id) as ConvRow | undefined;
    if (!conv) return reply.code(404).send({ error: '会话不存在' });

    const ts = now();
    db.prepare('INSERT INTO chat_messages (id, conv_id, role, content, created_at) VALUES (?,?,?,?,?)')
      .run(uuid(), id, 'user', b.content.trim(), ts);
    // 首条消息标题
    if (conv.title === '新对话') {
      db.prepare('UPDATE conversations SET title = ? WHERE id = ?').run(b.content.trim().slice(0, 20), id);
    }

    let result: { reply: string; actions: { tool: string; params: Record<string, unknown>; result: string }[] } | null;
    try {
      result = await agentReply(b.content.trim(), localDate());
    } catch (e) {
      return reply.code(502).send({ error: `LLM 调用失败：${(e as Error).message}` });
    }
    if (result === null) return reply.code(503).send({ error: LLM_OFF });

    // 动作轨迹（已是执行结果）
    const applied = result.actions.map((a) => a.result);

    const assistantId = uuid();
    db.prepare('INSERT INTO chat_messages (id, conv_id, role, content, actions, created_at) VALUES (?,?,?,?,?,?)')
      .run(assistantId, id, 'assistant', result.reply, JSON.stringify(applied), now());
    db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now(), id);

    return reply.code(201).send({ id: assistantId, role: 'assistant', content: result.reply, applied });
  });
}
