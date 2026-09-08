/**
 * A1 agent 系统工具集（M31）：function calling 的工具定义 + 执行器。
 * 执行器直接操作 db（复用现有路由的内部逻辑，禁止另起一套数据操作）。
 * 红线：不提供删除类工具；写工具执行结果返回人类可读摘要（进动作卡片）。
 */
import { db } from '../db/connection.js';
import { now, uuid, localDate } from '../routes/helpers.js';
import { searchDocs, stripToText } from '../services/docSearch.js';
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

export async function executeTool(name: string, params: Record<string, unknown>): Promise<string> {
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
        if (!rows.length && !projs.length) return `明天（${tmr}）没有到期任务`;
        return `明天（${tmr}）到期：\n` + [...projs.map((p) => `- 项目「${p.name}」`), ...rows.map((r) => `- ${r.title}（${r.ddl}）`)].join('\n');
      }
      if (range === 'overdue') {
        const rows = db.prepare(
          `SELECT title, ddl, status FROM tasks WHERE status IN ('todo','doing') AND ddl IS NOT NULL AND substr(ddl,1,10) < ? ORDER BY ddl`,
        ).all(today) as { title: string; ddl: string; status: string }[];
        const projs = db.prepare(
          `SELECT name, ddl, status FROM projects WHERE status IN ('todo','doing') AND ddl IS NOT NULL AND substr(ddl,1,10) < ? ORDER BY ddl`,
        ).all(today) as { name: string; ddl: string; status: string }[];
        if (!rows.length && !projs.length) return '没有逾期任务';
        return `逾期 ${rows.length + projs.length} 项：\n` + [...projs.map((p) => `- 项目「${p.name}」ddl ${p.ddl}`), ...rows.map((r) => `- ${r.title}（ddl ${r.ddl}）`)].join('\n');
      }
      if (range === 'week') {
        const done = db.prepare(
          `SELECT title FROM tasks WHERE status='done' AND done_at >= datetime('now','-7 days') ORDER BY done_at DESC LIMIT 20`,
        ).all() as { title: string }[];
        const doing = db.prepare(
          `SELECT name, (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status='done') AS dc, (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS tc
           FROM projects p WHERE p.status IN ('todo','doing') ORDER BY p.updated_at DESC LIMIT 20`,
        ).all() as { name: string; dc: number; tc: number }[];
        return [
          `本周完成 ${done.length} 项：` + (done.length ? done.map((d) => `- ${d.title}`).join('；') : '无'),
          `进行中项目 ${doing.length} 个：` + (doing.length ? doing.map((d) => `- ${d.name}（${d.dc}/${d.tc}）`).join('；') : '无'),
        ].join('\n');
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
      return [
        `今天（${today}）：`,
        todayTasks.length ? todayTasks.map((t) => `- [${t.status}] ${t.title}`).join('\n') : '- 今日无到期任务',
        `逾期待办共 ${overdue.c} 项`,
        follows.length ? '待跟进：' + follows.map((f) => `- ${f.name}（@${f.person}，${f.next_follow_date}）`).join('；') : '- 今日无待跟进',
      ].join('\n');
    }

    case 'create_task': {
      const title = String(params.title ?? '').trim();
      if (!title) return '失败：title 必填';
      const type = (params.type as string) || 'idea';
      const ddl = (params.ddl as string) || null;
      if (type === 'idea') {
        db.prepare(`INSERT INTO tasks (id,title,type,status,priority,ddl,tags,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`)
          .run(uuid(), title, 'idea', 'todo', 2, ddl, (params.tags as string) ?? '', ts, ts);
        return `✓ 想法「${title}」已记录${ddl ? `（${ddl}）` : ''}`;
      }
      // main/side/follow：优先挂现有项目子任务
      let projectId: string | null = null;
      const projName = String(params.project ?? '').trim();
      if (projName) {
        const p = db.prepare(`SELECT id FROM projects WHERE name LIKE ? AND status != 'archived' LIMIT 1`).get(`%${projName}%`) as { id: string } | undefined;
        if (p) projectId = p.id;
      }
      if (projectId) {
        db.prepare(`INSERT INTO tasks (id,title,type,status,priority,ddl,project_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`)
          .run(uuid(), title, type, 'todo', 2, ddl, projectId, ts, ts);
        return `✓ 子任务「${title}」已挂到项目「${projName}」`;
      }
      projectId = uuid();
      db.prepare(`INSERT INTO projects (id,name,type,status,priority,ddl,milestone,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(projectId, projName || title, type, 'todo', 2, ddl, '', ts, ts);
      if (type === 'follow' && params.person) {
        db.prepare(`INSERT INTO follow_ups (task_id, person, next_follow_date, urge_count) VALUES (?,?,?,0)`)
          .run(projectId, String(params.person), (params.next_follow_date as string) ?? localDate());
      }
      return `✓ 已创建${type === 'main' ? '主线' : type === 'follow' ? '跟进' : '支线'}项目「${projName || title}」${ddl ? `（截止 ${ddl}）` : ''}`;
    }

    case 'update_task': {
      const found = findTaskOrProject(String(params.match ?? ''));
      if (!found) return `未找到匹配「${params.match}」的任务`;
      const sets: string[] = [];
      const vals: unknown[] = [];
      if (params.title) { sets.push(found.table === 'tasks' ? 'title = ?' : 'name = ?'); vals.push(params.title); }
      if (params.ddl !== undefined) { sets.push('ddl = ?'); vals.push(params.ddl || null); }
      if (params.priority) { sets.push('priority = ?'); vals.push(params.priority); }
      if (params.tags !== undefined) { sets.push('tags = ?'); vals.push(params.tags); }
      if (params.note !== undefined) { sets.push('note = ?'); vals.push(params.note); }
      if (!sets.length) return '没有要更新的字段';
      sets.push('updated_at = ?');
      vals.push(ts, found.id);
      db.prepare(`UPDATE ${found.table} SET ${sets.join(',')} WHERE id = ?`).run(...vals);
      return `✓ 已更新「${found.title}」（${sets.length - 1} 个字段）`;
    }

    case 'complete_task': {
      const found = findTaskOrProject(String(params.match ?? ''));
      if (!found) return `未找到匹配「${params.match}」的任务`;
      db.prepare(`UPDATE ${found.table} SET status='done', done_at=?, updated_at=? WHERE id = ?`).run(ts, ts, found.id);
      return `✓ 「${found.title}」已标记完成`;
    }

    case 'search_documents': {
      const rows = (searchDocs(String(params.q ?? '')) as { id: string; title: string }[]).slice(0, 8);
      if (!rows.length) return `没有找到与「${params.q}」相关的文档`;
      return `找到 ${rows.length} 篇：\n` + rows.map((r) => `- 《${r.title}》 id:${r.id}`).join('\n');
    }

    case 'read_document': {
      const doc = db.prepare('SELECT title, content, content_text FROM documents WHERE id = ?').get(String(params.id)) as
        | { title: string; content: string; content_text: string | null }
        | undefined;
      if (!doc) return '文档不存在';
      const text = (doc.content_text?.trim() || stripToText(doc.content)).slice(0, 2000);
      return `《${doc.title}》\n${text}`;
    }

    case 'create_document': {
      const title = String(params.title ?? '').trim();
      if (!title) return '失败：title 必填';
      const folderId = params.folderName ? ensureFolder(String(params.folderName)) : null;
      const id = uuid();
      const content = mdToTiptapJson(String(params.content ?? ''));
      db.prepare(
        `INSERT INTO documents (id,title,content,content_text,folder_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`,
      ).run(id, title, content, stripToText(content), folderId, ts, ts);
      return `✓ 文档《${title}》已创建${params.folderName ? `到「${params.folderName}」` : ''}（id:${id}）`;
    }

    case 'format_document': {
      const doc = db.prepare('SELECT title, content, content_text FROM documents WHERE id = ?').get(String(params.id)) as
        | { title: string; content: string; content_text: string | null }
        | undefined;
      if (!doc) return '文档不存在';
      const text = doc.content_text?.trim() || stripToText(doc.content);
      const formatted = await formatDocument(text);
      if (!formatted) return '失败：LLM 未启用';
      const content = mdToTiptapJson(formatted);
      db.prepare('UPDATE documents SET content = ?, content_text = ?, updated_at = ? WHERE id = ?')
        .run(content, stripToText(content), ts, String(params.id));
      return `✓ 《${doc.title}》已重排格式（标题层级/列表结构已规范化）`;
    }

    case 'update_document': {
      const doc = db.prepare('SELECT title, content FROM documents WHERE id = ?').get(String(params.id)) as
        | { title: string; content: string }
        | undefined;
      if (!doc) return '文档不存在';
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
      if (!sets.length) return '没有要更新的字段';
      sets.push('updated_at = ?');
      vals.push(ts, String(params.id));
      db.prepare(`UPDATE documents SET ${sets.join(',')} WHERE id = ?`).run(...vals);
      return `✓ 《${doc.title}》已更新`;
    }

    case 'move_document': {
      const doc = db.prepare('SELECT title FROM documents WHERE id = ?').get(String(params.id)) as { title: string } | undefined;
      if (!doc) return '文档不存在';
      const folderId = ensureFolder(String(params.folderName ?? ''));
      db.prepare('UPDATE documents SET folder_id = ?, updated_at = ? WHERE id = ?').run(folderId, ts, String(params.id));
      return `✓ 《${doc.title}》已移入「${params.folderName}」`;
    }

    case 'quick_note': {
      const text = String(params.text ?? '').trim();
      if (!text) return '失败：text 必填';
      db.prepare('INSERT INTO inbox (id, content, created_at) VALUES (?,?,?)').run(uuid(), text, ts);
      return `✓ 已记入 Inbox：「${text.slice(0, 30)}」`;
    }

    default:
      return `未知工具：${name}`;
  }
}
