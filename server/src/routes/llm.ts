import type { FastifyInstance } from 'fastify';
import { db } from '../db/connection.js';
import { localDate, now, uuid } from './helpers.js';
import { generateWeeklyReport, polishText, petChat, askAboutText, formatDocument, fixTypos, checkTypos, streamChatCompletion, type WeeklyData, type ChatMessage } from '../llm/index.js';
import { Readable } from 'node:stream';
import { rebuildDocsFts, searchDocs, stripToText } from '../services/docSearch.js';

const LLM_OFF = 'LLM 未启用或未配置 API Key（请在 server/.env 配置 LLM_ENABLED=true / LLM_API_KEY）';

/** 本周一（本地时区） */
function weekStartDate(): Date {
  const d = new Date();
  const dow = (d.getDay() + 6) % 7; // 周一=0
  d.setDate(d.getDate() - dow);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** 聚合本周数据（M10 模型：projects 项目 + tasks 子任务/想法 + follow_ups 项目级跟进） */
function collectWeeklyData(): WeeklyData {
  const start = weekStartDate();
  const startIso = start.toISOString();
  const today = localDate();
  return {
    weekStart: localDate(start),
    weekEnd: today,
    doneProjects: db.prepare(
      "SELECT name, type FROM projects WHERE status='done' AND done_at >= ?",
    ).all(startIso) as WeeklyData['doneProjects'],
    doneTasks: db.prepare(
      `SELECT t.title, p.name AS project_name FROM tasks t
       LEFT JOIN projects p ON p.id = t.project_id
       WHERE t.status='done' AND t.done_at >= ?`,
    ).all(startIso) as WeeklyData['doneTasks'],
    doingProjects: db.prepare(
      `SELECT p.name, p.type,
         (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status='done') AS done_count,
         (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS total_count
       FROM projects p WHERE p.status IN ('todo','doing')`,
    ).all() as WeeklyData['doingProjects'],
    doingTasks: db.prepare(
      `SELECT t.title, p.name AS project_name, t.ddl FROM tasks t
       LEFT JOIN projects p ON p.id = t.project_id
       WHERE t.status IN ('todo','doing')`,
    ).all() as WeeklyData['doingTasks'],
    overdueTasks: db.prepare(
      `SELECT t.title, p.name AS project_name, t.ddl FROM tasks t
       LEFT JOIN projects p ON p.id = t.project_id
       WHERE t.status IN ('todo','doing') AND t.ddl IS NOT NULL AND substr(t.ddl,1,10) < ?`,
    ).all(today) as WeeklyData['overdueTasks'],
    followUps: db.prepare(
      `SELECT p.name, f.person, f.next_follow_date, f.urge_count
       FROM projects p JOIN follow_ups f ON f.task_id = p.id
       WHERE p.type='follow' AND p.status IN ('todo','doing')`,
    ).all() as WeeklyData['followUps'],
  };
}

type Node = Record<string, unknown>;

/** 简易 Markdown → Tiptap JSON（##/### 标题、- 列表、段落；去 ** 加粗标记） */
function mdToTiptapJson(md: string): string {
  const nodes: Node[] = [];
  let list: string[] | null = null;
  const flushList = () => {
    if (list?.length) {
      nodes.push({
        type: 'bulletList',
        content: list.map((t) => ({
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }],
        })),
      });
    }
    list = null;
  };
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    if (!line) { flushList(); continue; }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      flushList();
      nodes.push({ type: 'heading', attrs: { level: h[1].length },
        content: [{ type: 'text', text: h[2].replace(/\*\*(.+?)\*\*/g, '$1') }] });
      continue;
    }
    const li = line.match(/^[-*]\s+(.*)$/);
    if (li) { (list ??= []).push(li[1].replace(/\*\*(.+?)\*\*/g, '$1')); continue; }
    flushList();
    nodes.push({ type: 'paragraph', content: [{ type: 'text', text: line.replace(/\*\*(.+?)\*\*/g, '$1') }] });
  }
  flushList();
  return JSON.stringify({ type: 'doc', content: nodes.length ? nodes : [{ type: 'paragraph' }] });
}

/** 无 LLM 时的模板降级周报：纯数据拼接 */
function buildFallbackReport(week: WeeklyData): string {
  const lines: string[] = [`## 本周完成`];
  if (!week.doneProjects.length && !week.doneTasks.length) lines.push('- 无');
  for (const p of week.doneProjects) lines.push(`- 完成项目：${p.name}`);
  for (const t of week.doneTasks) lines.push(`- ${t.title}${t.project_name ? `（${t.project_name}）` : ''}`);
  lines.push('', '## 进行中');
  if (!week.doingProjects.length) lines.push('- 无');
  for (const p of week.doingProjects) lines.push(`- ${p.name}（${p.done_count}/${p.total_count}）`);
  lines.push('', '## 风险与逾期');
  if (!week.overdueTasks.length) lines.push('- 无');
  for (const t of week.overdueTasks) lines.push(`- ${t.title}（逾期，ddl ${t.ddl?.slice(0, 10) ?? ''}）`);
  lines.push('', '## 跟进情况');
  if (!week.followUps.length) lines.push('- 无');
  for (const f of week.followUps) lines.push(`- ${f.name}：@${f.person ?? ''}，已催 ${f.urge_count ?? 0} 次，下次跟进 ${f.next_follow_date ?? ''}`);
  lines.push('', '## 下周计划', '- （建议）推进进行中的项目，清理逾期任务');
  return lines.join('\n');
}

export default async function llmRoutes(app: FastifyInstance) {
  // 生成本周周报：聚合本周数据 → LLM → 落 documents（Tiptap JSON，可直接编辑）
  app.post('/api/llm/weekly-report', async (_req, reply) => {
    const week = collectWeeklyData();
    let md: string | null;
    try {
      md = await generateWeeklyReport(week);
    } catch (e) {
      return reply.code(502).send({ error: `LLM 调用失败：${(e as Error).message}` });
    }
    if (md === null) {
      // 未配置 LLM 时降级：模板拼接纯数据版周报（照样建文档）
      md = buildFallbackReport(week);
    }

    const id = uuid();
    const ts = now();
    const content = mdToTiptapJson(md);
    db.prepare(
      `INSERT INTO documents (id,title,content,content_text,tags,summary,created_at,updated_at)
       VALUES (?,?,?,?, '周报', ?, ?, ?)`,
    ).run(id, `周报 ${week.weekStart}`, content, stripToText(content), md.slice(0, 200), ts, ts);
    rebuildDocsFts();
    return reply.code(201).send(db.prepare('SELECT id,title,content,tags,source_url,summary,clip_id,created_at,updated_at FROM documents WHERE id = ?').get(id));
  });

  // 润色文本
  app.post('/api/llm/polish', async (req, reply) => {
    const b = (req.body ?? {}) as { text?: string; instruction?: string };
    if (!b.text?.trim()) return reply.code(400).send({ error: 'text 必填' });
    let result: string | null;
    try {
      result = await polishText(b.text, b.instruction);
    } catch (e) {
      return reply.code(502).send({ error: `LLM 调用失败：${(e as Error).message}` });
    }
    if (result === null) return reply.code(503).send({ error: LLM_OFF });
    return { result };
  });

  // 就选中内容提问（M16）
  app.post('/api/llm/ask', async (req, reply) => {
    const b = (req.body ?? {}) as { text?: string; question?: string };
    if (!b.text?.trim() || !b.question?.trim()) return reply.code(400).send({ error: 'text / question 必填' });
    let result: string | null;
    try {
      result = await askAboutText(b.text, b.question);
    } catch (e) {
      return reply.code(502).send({ error: `LLM 调用失败：${(e as Error).message}` });
    }
    if (result === null) return reply.code(503).send({ error: LLM_OFF });
    return { result };
  });

  // AI 排版（M16）：规范标题层级与列表结构
  app.post('/api/llm/format', async (req, reply) => {
    const b = (req.body ?? {}) as { content?: string };
    if (!b.content?.trim()) return reply.code(400).send({ error: 'content 必填' });
    let result: string | null;
    try {
      result = await formatDocument(b.content);
    } catch (e) {
      return reply.code(502).send({ error: `LLM 调用失败：${(e as Error).message}` });
    }
    if (result === null) return reply.code(503).send({ error: LLM_OFF });
    return { result };
  });

  // 错别字处理（M18）：mode=fix 流处理修正文本；mode=check 批处理返回问题清单
  app.post('/api/llm/typos', async (req, reply) => {
    const b = (req.body ?? {}) as { text?: string; mode?: 'fix' | 'check' };
    if (!b.text?.trim()) return reply.code(400).send({ error: 'text 必填' });
    try {
      if (b.mode === 'check') {
        const raw = await checkTypos(b.text);
        if (raw === null) return reply.code(503).send({ error: LLM_OFF });
        // 稳健解析：去围栏、截取 JSON 数组
        const m = raw.match(/\[[\s\S]*\]/);
        const issues = m ? JSON.parse(m[0]) : [];
        return { issues };
      }
      const result = await fixTypos(b.text);
      if (result === null) return reply.code(503).send({ error: LLM_OFF });
      return { result };
    } catch (e) {
      return reply.code(502).send({ error: `LLM 调用失败：${(e as Error).message}` });
    }
  });

  // 流式 chat（M29：feishu-clone AI 侧栏经 server 代理到 DeepSeek，SSE 透传）
  app.post('/api/llm/chat-stream', async (req, reply) => {
    const b = (req.body ?? {}) as { messages?: ChatMessage[] };
    if (!b.messages?.length) return reply.code(400).send({ error: 'messages 必填' });
    const upstream = await streamChatCompletion(b.messages);
    if (!upstream) return reply.code(503).send({ error: 'LLM 未启用或未配置 key' });
    if (!upstream.ok || !upstream.body) {
      const t = await upstream.text().catch(() => '');
      return reply.code(502).send({ error: `LLM 上游错误 ${upstream.status}：${t.slice(0, 300)}` });
    }
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    Readable.fromWeb(upstream.body as unknown as import('node:stream/web').ReadableStream).pipe(reply.raw);
    return reply;
  });

  // 桌宠对话（自动检索知识库文档作为参考上下文）
  app.post('/api/llm/chat', async (req, reply) => {
    const b = (req.body ?? {}) as { message?: string };
    if (!b.message?.trim()) return reply.code(400).send({ error: 'message 必填' });
    try {
      const message = b.message.trim();
      // 轻量 RAG：FTS 搜知识库，命中则取 top3 的正文片段注入人格 prompt
      const hits = (searchDocs(message) as { id: string; title: string }[]).slice(0, 3);
      let docHint = '';
      if (hits.length) {
        const rows = hits
          .map((h) => db.prepare('SELECT title, substr(content_text, 1, 600) AS t FROM documents WHERE id = ?').get(h.id) as { title: string; t: string })
          .filter((r) => r?.t);
        if (rows.length) {
          docHint = '用户知识库中可能相关的内容（相关就参考，不相关就忽略，不要硬套）：\n' +
            rows.map((r, i) => `【${i + 1}. ${r.title}】${r.t}`).join('\n');
        }
      }
      const result = await petChat(message, docHint || undefined);
      if (result === null) return reply.code(503).send({ error: LLM_OFF });
      return { result };
    } catch (e) {
      return reply.code(502).send({ error: `LLM 调用失败：${(e as Error).message}` });
    }
  });
}
