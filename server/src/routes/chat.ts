import type { FastifyInstance } from 'fastify';
import { db } from '../db/connection.js';
import { now, uuid, localDate } from './helpers.js';
import { chatAssistant, type ChatAction } from '../llm/index.js';

interface ConvRow { id: string; title: string; created_at: string; updated_at: string }
interface MsgRow { id: string; conv_id: string; role: string; content: string; actions: string; created_at: string }

const LLM_OFF = 'LLM 未启用或未配置 API Key（请在设置页配置）';

/** 应用 AI 助手抽取的动作：建项目/子任务/想法 */
function applyAction(a: ChatAction): string {
  const ts = now();
  const type = a.type ?? 'idea';
  const ddl = a.ddl ?? null;

  if (type === 'idea' || !type) {
    const id = uuid();
    db.prepare(
      `INSERT INTO tasks (id,title,type,status,priority,ddl,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).run(id, a.title.trim(), 'idea', 'todo', 2, ddl, ts, ts);
    return `想法「${a.title}」已加入 Inbox/全部任务`;
  }

  // main/side/follow → 项目级
  let projectId: string | null = null;
  if (a.project?.trim()) {
    const p = db.prepare(
      `SELECT id FROM projects WHERE name LIKE ? AND status != 'archived' LIMIT 1`,
    ).get(`%${a.project.trim()}%`) as { id: string } | undefined;
    if (p) projectId = p.id;
  }
  if (!projectId) {
    // 没匹配到现有项目：以动作标题创建新项目
    projectId = uuid();
    db.prepare(
      `INSERT INTO projects (id,name,type,status,priority,ddl,milestone,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).run(projectId, (a.project ?? a.title).trim(), type, 'todo', 2, ddl, '', ts, ts);
    if (type === 'follow' && a.person?.trim()) {
      db.prepare(
        `INSERT INTO follow_ups (task_id, person, next_follow_date, urge_count) VALUES (?,?,?,0)`,
      ).run(projectId, a.person.trim(), a.next_follow_date ?? localDate());
    }
    return `已创建${type === 'main' ? '主线' : type === 'follow' ? '跟进' : '支线'}项目「${(a.project ?? a.title).trim()}」${ddl ? `（截止 ${ddl}）` : ''}`;
  }

  // 匹配到现有项目 → 挂子任务
  const id = uuid();
  db.prepare(
    `INSERT INTO tasks (id,title,type,status,priority,ddl,project_id,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(id, a.title.trim(), type, 'todo', 2, ddl, projectId, ts, ts);
  return `已添加子任务「${a.title}」到项目`;
}

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

    let result: { reply: string; actions: ChatAction[] } | null;
    try {
      const projectNames = (db.prepare(`SELECT name FROM projects WHERE status != 'archived'`).all() as { name: string }[])
        .map((p) => p.name);
      result = await chatAssistant(b.content.trim(), localDate(), projectNames);
    } catch (e) {
      return reply.code(502).send({ error: `LLM 调用失败：${(e as Error).message}` });
    }
    if (result === null) return reply.code(503).send({ error: LLM_OFF });

    // 应用动作
    const applied: string[] = [];
    for (const a of result.actions) {
      try {
        applied.push(applyAction(a));
      } catch (e) {
        applied.push(`执行失败：${(e as Error).message}`);
      }
    }

    const assistantId = uuid();
    db.prepare('INSERT INTO chat_messages (id, conv_id, role, content, actions, created_at) VALUES (?,?,?,?,?,?)')
      .run(assistantId, id, 'assistant', result.reply, JSON.stringify(applied), now());
    db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now(), id);

    return reply.code(201).send({ id: assistantId, role: 'assistant', content: result.reply, applied });
  });
}
