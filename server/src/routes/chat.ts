import type { FastifyInstance } from 'fastify';
import { db } from '../db/connection.js';
import { now, uuid, localDate } from './helpers.js';
import { agentReply, agentPlan, type AgentReply } from '../llm/agentLoop.js';
import { executeAgentUndo } from '../llm/agentTools.js';

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

  // 发消息：存用户消息 → LLM（agent loop / plan 模式）→ 落轨迹 → 存助手消息
  // body.planMode=true 只出计划不执行；body.executePlan=计划文本 & planMsgId=计划消息 id 表示执行已确认计划（A4）
  app.post('/api/conversations/:id/messages', async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as { content?: string; planMode?: boolean; executePlan?: string; planMsgId?: string };
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

    // ---- A4 plan 模式：只出计划，不执行 ----
    if (b.planMode) {
      let plan: string | null;
      try {
        plan = await agentPlan(b.content.trim(), localDate());
      } catch (e) {
        return reply.code(502).send({ error: `LLM 调用失败：${(e as Error).message}` });
      }
      if (plan === null) return reply.code(503).send({ error: LLM_OFF });
      const assistantId = uuid();
      const planAction = [{ id: uuid(), tool: 'plan', text: plan, undoable: false, planStatus: 'pending' }];
      db.prepare('INSERT INTO chat_messages (id, conv_id, role, content, actions, created_at) VALUES (?,?,?,?,?,?)')
        .run(assistantId, id, 'assistant', `执行计划：\n${plan}`, JSON.stringify(planAction), now());
      db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now(), id);
      return reply.code(201).send({ id: assistantId, role: 'assistant', content: `执行计划：\n${plan}`, applied: planAction });
    }

    // ---- 正常执行 / 执行已确认的计划 ----
    const effectiveMsg = b.executePlan
      ? `原始需求：${b.content.trim()}\n\n以下是用户已确认的执行计划，请严格按计划调用工具执行：\n${b.executePlan}`
      : b.content.trim();

    let result: AgentReply | null;
    try {
      result = await agentReply(effectiveMsg, localDate());
    } catch (e) {
      return reply.code(502).send({ error: `LLM 调用失败：${(e as Error).message}` });
    }
    if (result === null) return reply.code(503).send({ error: LLM_OFF });

    // 动作轨迹（已是执行结果）；写操作快照落 agent_actions 供撤销
    const applied: { id: string; tool: string; text: string; undoable: boolean; clientAction?: unknown }[] = [];
    for (const a of result.actions) {
      const actionId = uuid();
      const undoable = !!a.undo;
      if (undoable) {
        db.prepare(
          `INSERT INTO agent_actions (id, conv_id, tool, params, undo_table, undo_id, before_json, result, created_at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
        ).run(actionId, id, a.tool, JSON.stringify(a.params), a.undo!.table, a.undo!.id,
          a.undo!.before ? JSON.stringify(a.undo!.before) : null, a.result, now());
      }
      applied.push({ id: actionId, tool: a.tool, text: a.result, undoable, ...(a.clientAction ? { clientAction: a.clientAction } : {}) });
    }

    const assistantId = uuid();
    db.prepare('INSERT INTO chat_messages (id, conv_id, role, content, actions, created_at) VALUES (?,?,?,?,?,?)')
      .run(assistantId, id, 'assistant', result.reply, JSON.stringify(applied), now());
    // A4：轮次级轨迹落 agent_runs（回放用）
    db.prepare('INSERT INTO agent_runs (id, conv_id, message_id, user_msg, plan_mode, rounds, reply, created_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(uuid(), id, assistantId, b.content.trim(), b.executePlan ? 1 : 0, JSON.stringify(result.rounds), result.reply, now());
    // 计划被执行后，把计划消息标记为已执行
    if (b.executePlan && b.planMsgId) {
      const planMsg = db.prepare('SELECT actions FROM chat_messages WHERE id = ?').get(b.planMsgId) as { actions: string } | undefined;
      if (planMsg) {
        const acts = JSON.parse(planMsg.actions || '[]') as { tool?: string; planStatus?: string }[];
        let changed = false;
        for (const a of acts) if (a.tool === 'plan' && a.planStatus === 'pending') { a.planStatus = 'executed'; changed = true; }
        if (changed) db.prepare('UPDATE chat_messages SET actions = ? WHERE id = ?').run(JSON.stringify(acts), b.planMsgId);
      }
    }
    db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now(), id);

    return reply.code(201).send({ id: assistantId, role: 'assistant', content: result.reply, applied, clientActions: result.clientActions });
  });

  // A4：取消待执行计划（仅标记状态，不产生轨迹）
  app.post('/api/conversations/:cid/messages/:mid/cancel-plan', async (req, reply) => {
    const { mid } = req.params as { mid: string };
    const msg = db.prepare('SELECT actions FROM chat_messages WHERE id = ?').get(mid) as { actions: string } | undefined;
    if (!msg) return reply.code(404).send({ error: '消息不存在' });
    const acts = JSON.parse(msg.actions || '[]') as { tool?: string; planStatus?: string }[];
    let changed = false;
    for (const a of acts) if (a.tool === 'plan' && a.planStatus === 'pending') { a.planStatus = 'cancelled'; changed = true; }
    if (!changed) return reply.code(400).send({ error: '没有待执行的计划' });
    db.prepare('UPDATE chat_messages SET actions = ? WHERE id = ?').run(JSON.stringify(acts), mid);
    return { cancelled: mid };
  });

  // A4 轨迹回放：按助手消息取轮次级轨迹
  app.get('/api/agent-runs/by-message/:messageId', async (req, reply) => {
    const { messageId } = req.params as { messageId: string };
    const run = db.prepare('SELECT * FROM agent_runs WHERE message_id = ?').get(messageId) as
      | { id: string; user_msg: string; plan_mode: number; rounds: string; reply: string; created_at: string }
      | undefined;
    if (!run) return reply.code(404).send({ error: '该消息没有轨迹记录' });
    return { ...run, rounds: JSON.parse(run.rounds || '[]') };
  });

  // A2 撤销：逆操作恢复（逻辑在工具层 executeAgentUndo，含复合工具专用分支）
  app.post('/api/agent-actions/:id/undo', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = db.prepare('SELECT * FROM agent_actions WHERE id = ?').get(id) as
      | { id: string; tool: string; undo_table: string | null; undo_id: string | null; before_json: string | null; undone: number }
      | undefined;
    if (!row) return reply.code(404).send({ error: '动作不存在' });
    if (row.undone) return reply.code(400).send({ error: '该动作已撤销过' });
    try {
      executeAgentUndo(row);
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
    db.prepare('UPDATE agent_actions SET undone = 1 WHERE id = ?').run(id);
    return { undone: id };
  });
}
