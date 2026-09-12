/**
 * agent 系统工具集（M31 A1 首发 11 工具；M34 A3 扩展知识库/剪藏/报告/跟进 + client_actions）。
 * 执行器直接操作 db（复用现有路由的内部逻辑，禁止另起一套数据操作）。
 * 红线：不提供删除类工具；写工具执行结果返回人类可读摘要（进动作卡片）。
 */
import { db } from '../db/connection.js';
import { now, uuid, localDate } from '../routes/helpers.js';
import { searchDocs, stripToText, rebuildDocsFts } from '../services/docSearch.js';
import { searchKnowledge, rebuildKnowledgeFts } from '../services/knowledgeSearch.js';
import { PERSONAL_TEAM_ID, teamExists, isMember } from '../services/teams.js';
import { pushNotification } from '../scheduler/index.js';
import { computeExpiresAt, KB_TYPES } from '../routes/knowledge.js';
import { createReport } from '../routes/reports.js';
import { config } from '../config.js';
import { formatDocument } from './index.js';

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCallRecord {
  tool: string;
  params: Record<string, unknown>;
  result: string;
}

/** 撤销信息（A2）：before=null 表示 create 类（撤销=删除该行） */
export interface UndoInfo {
  table: 'tasks' | 'projects' | 'documents' | 'doc_folders' | 'inbox' | 'knowledge_items' | 'reports' | 'publications' | 'follow_ups';
  id: string;
  before: Record<string, unknown> | null;
}

/** 前端联动动作（A3 client_actions）：随回复返回，由 ChatPage 执行页面跳转 */
export interface ClientAction {
  type: 'open_doc' | 'nav';
  docId?: string;
  title?: string;
  page?: string;
}

/** executeTool 返回：结果摘要 + 可选撤销信息 + 可选前端动作 */
export interface ToolExecResult {
  result: string;
  undo?: UndoInfo;
  clientAction?: ClientAction;
}

/** agent 身份（无请求上下文时的本机用户） */
const AGENT_USER = '本机用户';

/* ---------- 工具定义（JSON Schema） ---------- */

export const AGENT_TOOLS: ToolDef[] = [
  {
    name: 'query_schedule',
    description: '查询日程与任务状态：today=今天到期+逾期+待跟进，tomorrow=明天到期，week=本周进行中/已完成/逾期，overdue=全部逾期',
    parameters: {
      type: 'object',
      properties: { range: { type: 'string', enum: ['today', 'tomorrow', 'week', 'overdue'], description: '查询范围' } },
      required: ['range'],
    },
  },
  {
    name: 'create_task',
    description: '创建任务/日程项。type=idea 记为想法；main/side/follow 建项目或挂到现有项目（project 给出现有项目名则优先挂子任务）；follow 需 person+next_follow_date',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        ddl: { type: 'string', description: '截止时间 ISO 或 YYYY-MM-DD，可空' },
        type: { type: 'string', enum: ['idea', 'main', 'side', 'follow'], description: '缺省 idea' },
        project: { type: 'string', description: '所属项目名（模糊匹配现有项目），可空' },
        person: { type: 'string', description: 'follow 类型的跟进对象' },
        next_follow_date: { type: 'string', description: 'follow 类型的下次跟进日期' },
        tags: { type: 'string', description: '逗号分隔标签，可空' },
      },
      required: ['title'],
    },
  },
  {
    name: 'update_task',
    description: '按标题模糊匹配更新任务/项目：改标题、ddl、优先级、标签、备注',
    parameters: {
      type: 'object',
      properties: {
        match: { type: 'string', description: '任务/项目标题关键词' },
        title: { type: 'string' },
        ddl: { type: 'string' },
        priority: { type: 'number', enum: [1, 2, 3] },
        tags: { type: 'string' },
        note: { type: 'string' },
      },
      required: ['match'],
    },
  },
  {
    name: 'complete_task',
    description: '按标题模糊匹配，把任务/项目标记为完成',
    parameters: {
      type: 'object',
      properties: { match: { type: 'string', description: '任务/项目标题关键词' } },
      required: ['match'],
    },
  },
  {
    name: 'search_documents',
    description: '全文搜索文档（标题/正文/标签），返回 id+标题列表',
    parameters: {
      type: 'object',
      properties: { q: { type: 'string' } },
      required: ['q'],
    },
  },
  {
    name: 'read_document',
    description: '读取文档标题与正文（截断到 2000 字）',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'create_document',
    description: '新建文档，可放入指定文件夹（不存在则创建）',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        content: { type: 'string', description: 'Markdown 正文' },
        folderName: { type: 'string', description: '目标文件夹名，可空=根级' },
      },
      required: ['title'],
    },
  },
  {
    name: 'format_document',
    description: 'AI 排版：通读文档全文，重排标题层级与列表结构（用于格式散乱文档的整理）',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'update_document',
    description: '更新文档标题/正文；append=true 时在文末追加段落',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        content: { type: 'string', description: 'Markdown 正文（整体替换；append 时为追加内容）' },
        append: { type: 'boolean' },
      },
      required: ['id'],
    },
  },
  {
    name: 'move_document',
    description: '把文档移入指定文件夹（不存在则创建）',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        folderName: { type: 'string' },
      },
      required: ['id', 'folderName'],
    },
  },
  {
    name: 'quick_note',
    description: '记一条速记到 Inbox',
    parameters: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
  },
  /* ---------- A3 扩展：知识库 / 剪藏 / 报告 / 跟进 / 前端联动 ---------- */
  {
    name: 'kb_search',
    description: '搜索个人知识库条目（经验/规范/ADR/好文等），返回 id+类型+标题',
    parameters: {
      type: 'object',
      properties: { q: { type: 'string' } },
      required: ['q'],
    },
  },
  {
    name: 'kb_create',
    description: '把结论/经验沉淀为知识库条目。type: note=经验笔记(默认) intel=情报 share=好文 rfc=探讨 guide=指南 spec=规范 adr=决策',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        content: { type: 'string', description: 'Markdown 正文' },
        type: { type: 'string', enum: ['note', 'intel', 'share', 'rfc', 'guide', 'spec', 'adr'] },
        tags: { type: 'string', description: '逗号分隔标签，可空' },
      },
      required: ['title'],
    },
  },
  {
    name: 'kb_update',
    description: '按标题模糊匹配更新知识库条目：改标题/正文；append=true 时正文追加',
    parameters: {
      type: 'object',
      properties: {
        match: { type: 'string', description: '条目标题关键词' },
        title: { type: 'string' },
        content: { type: 'string' },
        append: { type: 'boolean' },
      },
      required: ['match'],
    },
  },
  {
    name: 'kb_publish',
    description: '把知识库条目发布到指定团队的收件箱（按团队名模糊匹配）',
    parameters: {
      type: 'object',
      properties: {
        match: { type: 'string', description: '条目标题关键词' },
        team: { type: 'string', description: '目标团队名' },
      },
      required: ['match', 'team'],
    },
  },
  {
    name: 'convert_clip',
    description: '把剪藏箱里的网页剪藏转成文档。match 给标题关键词，缺省转最新一条未转换的',
    parameters: {
      type: 'object',
      properties: { match: { type: 'string', description: '剪藏标题关键词，可空' } },
    },
  },
  {
    name: 'clip_to_knowledge',
    description: '把剪藏沉淀为知识库「好文」条目（保留来源链接）。match 给标题关键词，缺省取最新一条',
    parameters: {
      type: 'object',
      properties: { match: { type: 'string', description: '剪藏标题关键词，可空' } },
    },
  },
  {
    name: 'generate_report',
    description: '生成报告：daily=今日日报 weekly=本周周报(含 LLM 润色) monthly=本月月报。已存在同日期报告则直接返回',
    parameters: {
      type: 'object',
      properties: { type: { type: 'string', enum: ['daily', 'weekly', 'monthly'] } },
      required: ['type'],
    },
  },
  {
    name: 'urge_follow',
    description: '催办：按项目名或被催人模糊匹配跟进项，催促次数+1',
    parameters: {
      type: 'object',
      properties: { match: { type: 'string', description: '跟进项目名或被催人名' } },
      required: ['match'],
    },
  },
  {
    name: 'open_document',
    description: '在用户界面上打开指定文档（操作完成后用户可能想查看时使用，如“帮我打开那篇文档”）',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: '文档 id（先用 search_documents 获取）' } },
      required: ['id'],
    },
  },
  {
    name: 'navigate_to',
    description: '把用户界面切换到指定栏目页面（如生成报告后跳转到报告页）',
    parameters: {
      type: 'object',
      properties: {
        page: {
          type: 'string',
          enum: ['today', 'tasks', 'calendar', 'timeline', 'follow', 'inbox', 'clips', 'docs', 'reports', 'canvas', 'knowledge', 'settings', 'assistant'],
        },
      },
      required: ['page'],
    },
  },
];

/* ---------- 执行辅助 ---------- */

function findFolderByName(name: string): { id: string; name: string } | undefined {
  return db.prepare('SELECT id, name FROM doc_folders WHERE name LIKE ? LIMIT 1').get(`%${name}%`) as
    | { id: string; name: string }
    | undefined;
}

function ensureFolder(name: string): string {
  const f = findFolderByName(name);
  if (f) return f.id;
  const id = uuid();
  const ts = now();
  db.prepare('INSERT INTO doc_folders (id, name, parent_id, sort_order, created_at, updated_at) VALUES (?,?,NULL,0,?,?)')
    .run(id, name.trim(), ts, ts);
  return id;
}

/** Markdown → Tiptap JSON（与 reports.ts 同款简版：标题/列表/段落） */
function mdToTiptapJson(md: string): string {
  const nodes: Record<string, unknown>[] = [];
  let list: string[] | null = null;
  const flushList = () => {
    if (list?.length) {
      nodes.push({
        type: 'bulletList',
        content: list.map((t) => ({ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })),
      });
    }
    list = null;
  };
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    if (!line) { flushList(); continue; }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushList();
      nodes.push({ type: 'heading', attrs: { level: Math.min(9, h[1].length) }, content: [{ type: 'text', text: h[2].replace(/\*\*(.+?)\*\*/g, '$1') }] });
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

function findTaskOrProject(match: string): { table: 'tasks' | 'projects'; id: string; title: string } | undefined {
  const like = `%${match}%`;
  const t = db.prepare(`SELECT id, title FROM tasks WHERE title LIKE ? AND status != 'archived' ORDER BY updated_at DESC LIMIT 1`).get(like) as
    | { id: string; title: string }
    | undefined;
  if (t) return { table: 'tasks', ...t };
  const p = db.prepare(`SELECT id, name FROM projects WHERE name LIKE ? AND status != 'archived' ORDER BY updated_at DESC LIMIT 1`).get(like) as
    | { id: string; name: string }
    | undefined;
  if (p) return { table: 'projects', id: p.id, title: p.name };
  return undefined;
}

/* ---------- 工具执行器 ---------- */

export async function executeTool(name: string, params: Record<string, unknown>): Promise<ToolExecResult> {
  const ts = now();
  switch (name) {
    case 'query_schedule': {
      const range = String(params.range ?? 'today');
      const today = localDate();
      if (range === 'tomorrow') {
        const tmr = localDate(new Date(Date.now() + 86400000));
        const rows = db.prepare(
          `SELECT title, status, ddl FROM tasks WHERE substr(ddl,1,10) = ? ORDER BY ddl LIMIT 20`,
        ).all(tmr) as { title: string; status: string; ddl: string }[];
        const projs = db.prepare(
          `SELECT name, status, ddl FROM projects WHERE substr(ddl,1,10) = ? ORDER BY ddl LIMIT 20`,
        ).all(tmr) as { name: string; status: string; ddl: string }[];
        if (!rows.length && !projs.length) return { result: `明天（${tmr}）没有到期任务` };
        return { result: `明天（${tmr}）到期：\n` + [...projs.map((p) => `- 项目「${p.name}」`), ...rows.map((r) => `- ${r.title}（${r.ddl}）`)].join('\n') };
      }
      if (range === 'overdue') {
        const rows = db.prepare(
          `SELECT title, ddl, status FROM tasks WHERE status IN ('todo','doing') AND ddl IS NOT NULL AND substr(ddl,1,10) < ? ORDER BY ddl`,
        ).all(today) as { title: string; ddl: string; status: string }[];
        const projs = db.prepare(
          `SELECT name, ddl, status FROM projects WHERE status IN ('todo','doing') AND ddl IS NOT NULL AND substr(ddl,1,10) < ? ORDER BY ddl`,
        ).all(today) as { name: string; ddl: string; status: string }[];
        if (!rows.length && !projs.length) return { result: '没有逾期任务' };
        return { result: `逾期 ${rows.length + projs.length} 项：\n` + [...projs.map((p) => `- 项目「${p.name}」ddl ${p.ddl}`), ...rows.map((r) => `- ${r.title}（ddl ${r.ddl}）`)].join('\n') };
      }
      if (range === 'week') {
        const done = db.prepare(
          `SELECT title FROM tasks WHERE status='done' AND done_at >= datetime('now','-7 days') ORDER BY done_at DESC LIMIT 20`,
        ).all() as { title: string }[];
        const doing = db.prepare(
          `SELECT name, (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status='done') AS dc, (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS tc
           FROM projects p WHERE p.status IN ('todo','doing') ORDER BY p.updated_at DESC LIMIT 20`,
        ).all() as { name: string; dc: number; tc: number }[];
        return { result: [
          `本周完成 ${done.length} 项：` + (done.length ? done.map((d) => `- ${d.title}`).join('；') : '无'),
          `进行中项目 ${doing.length} 个：` + (doing.length ? doing.map((d) => `- ${d.name}（${d.dc}/${d.tc}）`).join('；') : '无'),
        ].join('\n') };
      }
      // today
      const todayTasks = db.prepare(
        `SELECT title, status, ddl FROM tasks WHERE substr(ddl,1,10) = ? OR done_at LIKE ? || '%' ORDER BY created_at DESC LIMIT 20`,
      ).all(today, today) as { title: string; status: string; ddl: string }[];
      const overdue = db.prepare(
        `SELECT COUNT(*) AS c FROM tasks WHERE status IN ('todo','doing') AND ddl IS NOT NULL AND substr(ddl,1,10) < ?`,
      ).get(today) as { c: number };
      const follows = db.prepare(
        `SELECT p.name, f.person, f.next_follow_date FROM projects p JOIN follow_ups f ON f.task_id = p.id
         WHERE p.type='follow' AND p.status IN ('todo','doing') AND substr(f.next_follow_date,1,10) <= ?`,
      ).all(today) as { name: string; person: string; next_follow_date: string }[];
      return { result: [
        `今天（${today}）：`,
        todayTasks.length ? todayTasks.map((t) => `- [${t.status}] ${t.title}`).join('\n') : '- 今日无到期任务',
        `逾期待办共 ${overdue.c} 项`,
        follows.length ? '待跟进：' + follows.map((f) => `- ${f.name}（@${f.person}，${f.next_follow_date}）`).join('；') : '- 今日无待跟进',
      ].join('\n') };
    }

    case 'create_task': {
      const title = String(params.title ?? '').trim();
      if (!title) return { result: '失败：title 必填' };
      const type = (params.type as string) || 'idea';
      const ddl = (params.ddl as string) || null;
      if (type === 'idea') {
        const id = uuid();
        db.prepare(`INSERT INTO tasks (id,title,type,status,priority,ddl,tags,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`)
          .run(id, title, 'idea', 'todo', 2, ddl, (params.tags as string) ?? '', ts, ts);
        return { result: `✓ 想法「${title}」已记录${ddl ? `（${ddl}）` : ''}`, undo: { table: 'tasks', id, before: null } };
      }
      // main/side/follow：优先挂现有项目子任务
      let projectId: string | null = null;
      const projName = String(params.project ?? '').trim();
      if (projName) {
        const p = db.prepare(`SELECT id FROM projects WHERE name LIKE ? AND status != 'archived' LIMIT 1`).get(`%${projName}%`) as { id: string } | undefined;
        if (p) projectId = p.id;
      }
      if (projectId) {
        const id = uuid();
        db.prepare(`INSERT INTO tasks (id,title,type,status,priority,ddl,project_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`)
          .run(id, title, type, 'todo', 2, ddl, projectId, ts, ts);
        return { result: `✓ 子任务「${title}」已挂到项目「${projName}」`, undo: { table: 'tasks', id, before: null } };
      }
      projectId = uuid();
      db.prepare(`INSERT INTO projects (id,name,type,status,priority,ddl,milestone,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(projectId, projName || title, type, 'todo', 2, ddl, '', ts, ts);
      if (type === 'follow' && params.person) {
        db.prepare(`INSERT INTO follow_ups (task_id, person, next_follow_date, urge_count) VALUES (?,?,?,0)`)
          .run(projectId, String(params.person), (params.next_follow_date as string) ?? localDate());
      }
      return { result: `✓ 已创建${type === 'main' ? '主线' : type === 'follow' ? '跟进' : '支线'}项目「${projName || title}」${ddl ? `（截止 ${ddl}）` : ''}`, undo: { table: 'projects', id: projectId, before: null } };
    }

    case 'update_task': {
      const found = findTaskOrProject(String(params.match ?? ''));
      if (!found) return { result: `未找到匹配「${params.match}」的任务` };
      const before = db.prepare(`SELECT * FROM ${found.table} WHERE id = ?`).get(found.id) as Record<string, unknown>;
      const sets: string[] = [];
      const vals: unknown[] = [];
      if (params.title) { sets.push(found.table === 'tasks' ? 'title = ?' : 'name = ?'); vals.push(params.title); }
      if (params.ddl !== undefined) { sets.push('ddl = ?'); vals.push(params.ddl || null); }
      if (params.priority) { sets.push('priority = ?'); vals.push(params.priority); }
      if (params.tags !== undefined) { sets.push('tags = ?'); vals.push(params.tags); }
      if (params.note !== undefined) { sets.push('note = ?'); vals.push(params.note); }
      if (!sets.length) return { result: '没有要更新的字段' };
      sets.push('updated_at = ?');
      vals.push(ts, found.id);
      db.prepare(`UPDATE ${found.table} SET ${sets.join(',')} WHERE id = ?`).run(...vals);
      return { result: `✓ 已更新「${found.title}」（${sets.length - 1} 个字段）`, undo: { table: found.table, id: found.id, before } };
    }

    case 'complete_task': {
      const found = findTaskOrProject(String(params.match ?? ''));
      if (!found) return { result: `未找到匹配「${params.match}」的任务` };
      const before = db.prepare(`SELECT * FROM ${found.table} WHERE id = ?`).get(found.id) as Record<string, unknown>;
      db.prepare(`UPDATE ${found.table} SET status='done', done_at=?, updated_at=? WHERE id = ?`).run(ts, ts, found.id);
      return { result: `✓ 「${found.title}」已标记完成`, undo: { table: found.table, id: found.id, before } };
    }

    case 'search_documents': {
      const rows = (searchDocs(String(params.q ?? '')) as { id: string; title: string }[]).slice(0, 8);
      if (!rows.length) return { result: `没有找到与「${params.q}」相关的文档` };
      return { result: `找到 ${rows.length} 篇：\n` + rows.map((r) => `- 《${r.title}》 id:${r.id}`).join('\n') };
    }

    case 'read_document': {
      const doc = db.prepare('SELECT title, content, content_text FROM documents WHERE id = ?').get(String(params.id)) as
        | { title: string; content: string; content_text: string | null }
        | undefined;
      if (!doc) return { result: '文档不存在' };
      const text = (doc.content_text?.trim() || stripToText(doc.content)).slice(0, 2000);
      return { result: `《${doc.title}》\n${text}` };
    }

    case 'create_document': {
      const title = String(params.title ?? '').trim();
      if (!title) return { result: '失败：title 必填' };
      const folderId = params.folderName ? ensureFolder(String(params.folderName)) : null;
      const id = uuid();
      const content = mdToTiptapJson(String(params.content ?? ''));
      db.prepare(
        `INSERT INTO documents (id,title,content,content_text,folder_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`,
      ).run(id, title, content, stripToText(content), folderId, ts, ts);
      return { result: `✓ 文档《${title}》已创建${params.folderName ? `到「${params.folderName}」` : ''}（id:${id}）`, undo: { table: 'documents', id, before: null } };
    }

    case 'format_document': {
      const doc = db.prepare('SELECT title, content, content_text FROM documents WHERE id = ?').get(String(params.id)) as
        | { title: string; content: string; content_text: string | null }
        | undefined;
      if (!doc) return { result: '文档不存在' };
      const text = doc.content_text?.trim() || stripToText(doc.content);
      const formatted = await formatDocument(text);
      if (!formatted) return { result: '失败：LLM 未启用' };
      const before = { content: doc.content, content_text: doc.content_text };
      const content = mdToTiptapJson(formatted);
      db.prepare('UPDATE documents SET content = ?, content_text = ?, updated_at = ? WHERE id = ?')
        .run(content, stripToText(content), ts, String(params.id));
      return { result: `✓ 《${doc.title}》已重排格式（标题层级/列表结构已规范化）`, undo: { table: 'documents', id: String(params.id), before } };
    }

    case 'update_document': {
      const doc = db.prepare('SELECT title, content FROM documents WHERE id = ?').get(String(params.id)) as
        | { title: string; content: string }
        | undefined;
      if (!doc) return { result: '文档不存在' };
      const sets: string[] = [];
      const vals: unknown[] = [];
      if (params.title) { sets.push('title = ?'); vals.push(params.title); }
      if (params.content !== undefined) {
        if (params.append) {
          let json: { content?: unknown[] };
          try { json = JSON.parse(doc.content); } catch { json = {}; }
          const add = JSON.parse(mdToTiptapJson(String(params.content)));
          json.content = [...(json.content ?? []), ...add.content];
          const merged = JSON.stringify(json);
          sets.push('content = ?', 'content_text = ?');
          vals.push(merged, stripToText(merged));
        } else {
          const content = mdToTiptapJson(String(params.content));
          sets.push('content = ?', 'content_text = ?');
          vals.push(content, stripToText(content));
        }
      }
      if (!sets.length) return { result: '没有要更新的字段' };
      sets.push('updated_at = ?');
      vals.push(ts, String(params.id));
      db.prepare(`UPDATE documents SET ${sets.join(',')} WHERE id = ?`).run(...vals);
      return { result: `✓ 《${doc.title}》已更新`, undo: { table: 'documents', id: String(params.id), before: { title: doc.title, content: doc.content, content_text: (doc as Record<string, unknown>).content_text } } };
    }

    case 'move_document': {
      const doc = db.prepare('SELECT title, folder_id FROM documents WHERE id = ?').get(String(params.id)) as { title: string; folder_id: string | null } | undefined;
      if (!doc) return { result: '文档不存在' };
      const before = { folder_id: doc.folder_id };
      const folderId = ensureFolder(String(params.folderName ?? ''));
      db.prepare('UPDATE documents SET folder_id = ?, updated_at = ? WHERE id = ?').run(folderId, ts, String(params.id));
      return { result: `✓ 《${doc.title}》已移入「${params.folderName}」`, undo: { table: 'documents', id: String(params.id), before } };
    }

    case 'quick_note': {
      const text = String(params.text ?? '').trim();
      if (!text) return { result: '失败：text 必填' };
      const id = uuid();
      db.prepare('INSERT INTO inbox (id, content, created_at) VALUES (?,?,?)').run(id, text, ts);
      return { result: `✓ 已记入 Inbox：「${text.slice(0, 30)}」`, undo: { table: 'inbox', id, before: null } };
    }

    /* ---------- A3：知识库 ---------- */

    case 'kb_search': {
      const rows = (searchKnowledge({
        q: String(params.q ?? ''), teamId: PERSONAL_TEAM_ID, status: 'active', hideExpired: true, limit: 8,
      }) as { id: string; type: string; title: string }[]);
      if (!rows.length) return { result: `知识库没有找到与「${params.q}」相关的条目` };
      return { result: `找到 ${rows.length} 条：\n` + rows.map((r) => `- [${r.type}] 《${r.title}》 id:${r.id}`).join('\n') };
    }

    case 'kb_create': {
      const title = String(params.title ?? '').trim();
      if (!title) return { result: '失败：title 必填' };
      const type = KB_TYPES.has(String(params.type)) ? String(params.type) : 'note';
      const id = uuid();
      const content = String(params.content ?? '');
      const tags = String(params.tags ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      db.prepare(
        `INSERT INTO knowledge_items
         (id,type,title,content,content_text,team_id,project_id,author,owners,channels,tags,ttl,status,acl,notify,related,source_url,created_at,updated_at,expires_at)
         VALUES (?,?,?,?,?,?,NULL,?, '[]', '[]', ?, '', ?, 'team', 'digest', '[]', '', ?, ?, ?)`,
      ).run(
        id, type, title, content, stripToText(content), PERSONAL_TEAM_ID, AGENT_USER,
        JSON.stringify(tags), type === 'rfc' ? 'open' : 'active', ts, ts, computeExpiresAt(type),
      );
      rebuildKnowledgeFts();
      return { result: `✓ 知识库条目《${title}》已创建（${type}）`, undo: { table: 'knowledge_items', id, before: null } };
    }

    case 'kb_update': {
      const item = db.prepare(
        `SELECT id, title, content, content_text FROM knowledge_items WHERE team_id = ? AND title LIKE ? AND status != 'archived' ORDER BY updated_at DESC LIMIT 1`,
      ).get(PERSONAL_TEAM_ID, `%${String(params.match ?? '')}%`) as
        | { id: string; title: string; content: string; content_text: string | null }
        | undefined;
      if (!item) return { result: `未找到匹配「${params.match}」的知识库条目` };
      const before = { title: item.title, content: item.content, content_text: item.content_text };
      const sets: string[] = [];
      const vals: unknown[] = [];
      if (params.title) { sets.push('title = ?'); vals.push(String(params.title).trim()); }
      if (params.content !== undefined) {
        const content = params.append ? `${item.content}\n${String(params.content)}` : String(params.content);
        sets.push('content = ?', 'content_text = ?');
        vals.push(content, stripToText(content));
      }
      if (!sets.length) return { result: '没有要更新的字段' };
      sets.push('updated_at = ?');
      vals.push(ts, item.id);
      db.prepare(`UPDATE knowledge_items SET ${sets.join(',')} WHERE id = ?`).run(...vals);
      rebuildKnowledgeFts();
      return { result: `✓ 知识库条目《${item.title}》已更新`, undo: { table: 'knowledge_items', id: item.id, before } };
    }

    case 'kb_publish': {
      const item = db.prepare(
        `SELECT id, title, team_id, updated_at FROM knowledge_items WHERE team_id = ? AND title LIKE ? ORDER BY updated_at DESC LIMIT 1`,
      ).get(PERSONAL_TEAM_ID, `%${String(params.match ?? '')}%`) as
        | { id: string; title: string; team_id: string; updated_at: string }
        | undefined;
      if (!item) return { result: `未找到匹配「${params.match}」的知识库条目` };
      const team = db.prepare('SELECT id, name FROM teams WHERE name LIKE ? LIMIT 1').get(`%${String(params.team ?? '')}%`) as
        | { id: string; name: string }
        | undefined;
      if (!team || !teamExists(team.id)) return { result: `未找到团队「${params.team}」` };
      if (team.id === item.team_id) return { result: '不能发布到本团队（条目已在个人空间）' };
      if (!isMember(team.id, AGENT_USER)) return { result: `你不是团队「${team.name}」的成员` };
      const dup = db.prepare(`SELECT id FROM publications WHERE item_id = ? AND to_team = ? AND status = 'pending'`).get(item.id, team.id);
      if (dup) return { result: `《${item.title}》已在「${team.name}」收件箱待处理` };
      const pid = uuid();
      db.prepare(
        `INSERT INTO publications (id, item_id, from_team, to_team, from_author, source_updated_at, published_at)
         VALUES (?,?,?,?,?,?,?)`,
      ).run(pid, item.id, item.team_id, team.id, AGENT_USER, item.updated_at, ts);
      const members = db.prepare('SELECT user_name FROM team_members WHERE team_id = ?').all(team.id) as { user_name: string }[];
      for (const m of members) {
        if (m.user_name !== AGENT_USER) pushNotification(`📤 ${AGENT_USER} 发布了「${item.title}」到本团队收件箱`, pid);
      }
      return { result: `✓ 《${item.title}》已发布到「${team.name}」收件箱`, undo: { table: 'publications', id: pid, before: null } };
    }

    /* ---------- A3：剪藏 ---------- */

    case 'convert_clip': {
      const like = `%${String(params.match ?? '')}%`;
      const clip = (params.match
        ? db.prepare(`SELECT * FROM clips WHERE status = 'inbox' AND title LIKE ? ORDER BY created_at DESC LIMIT 1`).get(like)
        : db.prepare(`SELECT * FROM clips WHERE status = 'inbox' ORDER BY created_at DESC LIMIT 1`).get()) as
        | { id: string; title: string; content_html: string; excerpt: string; url: string }
        | undefined;
      if (!clip) return { result: params.match ? `未找到匹配「${params.match}」的未转换剪藏` : '剪藏箱里没有待转换的剪藏' };
      // 复用 clips 路由的转换逻辑：图片相对路径转绝对 + 入库 documents + 标记 converted
      const contentHtml = clip.content_html.replaceAll(
        'src="/api/clips/images/',
        `src="http://127.0.0.1:${config.port}/api/clips/images/`,
      );
      const docId = uuid();
      db.prepare(
        `INSERT INTO documents (id,title,content,content_text,source_url,summary,clip_id,folder_id,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,NULL,?,?)`,
      ).run(docId, clip.title, contentHtml, stripToText(contentHtml), clip.url, clip.excerpt, clip.id, ts, ts);
      db.prepare("UPDATE clips SET status='converted', converted_doc_id=? WHERE id=?").run(docId, clip.id);
      rebuildDocsFts();
      // 复合撤销：before 里夹带 clipId，executeAgentUndo 按工具名走专用分支
      return {
        result: `✓ 剪藏《${clip.title}》已转为文档`,
        undo: { table: 'documents', id: docId, before: { clipId: clip.id } },
        clientAction: { type: 'open_doc', docId, title: clip.title },
      };
    }

    case 'clip_to_knowledge': {
      const like = `%${String(params.match ?? '')}%`;
      const clip = (params.match
        ? db.prepare('SELECT * FROM clips WHERE title LIKE ? ORDER BY created_at DESC LIMIT 1').get(like)
        : db.prepare('SELECT * FROM clips ORDER BY created_at DESC LIMIT 1').get()) as
        | { id: string; title: string; excerpt: string; url: string }
        | undefined;
      if (!clip) return { result: params.match ? `未找到匹配「${params.match}」的剪藏` : '剪藏箱是空的' };
      const id = uuid();
      const content = `${clip.excerpt}\n\n来源：${clip.url || '（无）'}`;
      db.prepare(
        `INSERT INTO knowledge_items
         (id,type,title,content,content_text,team_id,project_id,author,owners,channels,tags,ttl,status,acl,notify,related,source_url,source_clip_id,created_at,updated_at,expires_at)
         VALUES (?,'share',?,?,?, ?,NULL,?, '[]', '[]', '[]', '', 'active', 'team', 'digest', '[]', ?, ?, ?, ?, NULL)`,
      ).run(id, clip.title, content, stripToText(content), PERSONAL_TEAM_ID, AGENT_USER, clip.url, clip.id, ts, ts);
      rebuildKnowledgeFts();
      return { result: `✓ 剪藏《${clip.title}》已沉淀为知识库好文`, undo: { table: 'knowledge_items', id, before: null } };
    }

    /* ---------- A3：报告 / 跟进 ---------- */

    case 'generate_report': {
      const type = String(params.type ?? 'daily');
      if (!['daily', 'weekly', 'monthly'].includes(type)) return { result: 'type 必须是 daily/weekly/monthly' };
      const label = type === 'daily' ? '日报' : type === 'weekly' ? '周报' : '月报';
      const { row, created } = await createReport(type as 'daily' | 'weekly' | 'monthly', localDate());
      return {
        result: created ? `✓ ${label}已生成《${row.title}》` : `今天的${label}已存在《${row.title}》，未重复生成`,
        undo: created ? { table: 'reports', id: String(row.id), before: null } : undefined,
        clientAction: { type: 'nav', page: 'reports' },
      };
    }

    case 'urge_follow': {
      const like = `%${String(params.match ?? '')}%`;
      const row = db.prepare(
        `SELECT f.task_id, f.person, f.urge_count, f.last_urged_at, p.name FROM follow_ups f
         JOIN projects p ON p.id = f.task_id
         WHERE p.status IN ('todo','doing') AND (p.name LIKE ? OR f.person LIKE ?) ORDER BY p.updated_at DESC LIMIT 1`,
      ).get(like, like) as
        | { task_id: string; person: string; urge_count: number; last_urged_at: string | null; name: string }
        | undefined;
      if (!row) return { result: `未找到匹配「${params.match}」的跟进项` };
      db.prepare('UPDATE follow_ups SET urge_count = urge_count + 1, last_urged_at = ? WHERE task_id = ?').run(ts, row.task_id);
      return {
        result: `✓ 已催办「${row.name}」（@${row.person}，第 ${row.urge_count + 1} 次）`,
        undo: { table: 'follow_ups', id: row.task_id, before: { urge_count: row.urge_count, last_urged_at: row.last_urged_at } },
      };
    }

    /* ---------- A3：前端联动（client_actions） ---------- */

    case 'open_document': {
      const doc = db.prepare('SELECT id, title FROM documents WHERE id = ?').get(String(params.id)) as
        | { id: string; title: string }
        | undefined;
      if (!doc) return { result: '文档不存在，无法打开' };
      return { result: `✓ 正在打开《${doc.title}》`, clientAction: { type: 'open_doc', docId: doc.id, title: doc.title } };
    }

    case 'navigate_to': {
      const page = String(params.page ?? '');
      return { result: `✓ 正在切换到「${page}」页面`, clientAction: { type: 'nav', page } };
    }

    default:
      return { result: `未知工具：${name}` };
  }
}

/* ---------- 撤销执行器（A2 重构到工具层；A3 复合工具走专用分支） ---------- */

const GENERIC_UNDO_TABLES = ['tasks', 'projects', 'documents', 'doc_folders', 'inbox', 'knowledge_items', 'reports', 'publications'];

/**
 * 执行撤销。create 类（before=null）删行；改类回写 before 快照。
 * 复合工具（convert_clip / urge_follow）按工具名走专用分支。
 */
export function executeAgentUndo(row: { tool: string; undo_table: string | null; undo_id: string | null; before_json: string | null }): void {
  const table = row.undo_table;
  if (!table || !row.undo_id) throw new Error('该动作不可撤销');

  // convert_clip：删文档 + 恢复剪藏状态（clipId 存在 before 快照里）
  if (row.tool === 'convert_clip') {
    db.prepare('DELETE FROM documents WHERE id = ?').run(row.undo_id);
    const before = row.before_json ? (JSON.parse(row.before_json) as { clipId?: string }) : {};
    if (before.clipId) {
      db.prepare("UPDATE clips SET status='inbox', converted_doc_id=NULL WHERE id = ?").run(before.clipId);
    }
    rebuildDocsFts();
    return;
  }

  // urge_follow：follow_ups 主键是 task_id，回写催促计数快照
  if (row.tool === 'urge_follow') {
    const before = row.before_json ? (JSON.parse(row.before_json) as Record<string, unknown>) : {};
    db.prepare('UPDATE follow_ups SET urge_count = ?, last_urged_at = ? WHERE task_id = ?')
      .run(before.urge_count ?? 0, before.last_urged_at ?? null, row.undo_id);
    return;
  }

  if (!GENERIC_UNDO_TABLES.includes(table)) throw new Error('非法目标表');

  if (row.before_json === null) {
    // create 类：撤销 = 删行（连带清理）
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(row.undo_id);
    if (table === 'projects') db.prepare('DELETE FROM follow_ups WHERE task_id = ?').run(row.undo_id);
    if (table === 'knowledge_items') rebuildKnowledgeFts();
    if (table === 'documents') rebuildDocsFts();
  } else {
    // 改类：回写快照字段
    const before = JSON.parse(row.before_json) as Record<string, unknown>;
    const cols = Object.keys(before);
    db.prepare(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
      .run(...cols.map((c) => before[c]), now(), row.undo_id);
    if (table === 'knowledge_items') rebuildKnowledgeFts();
    if (table === 'documents') rebuildDocsFts();
  }
}
