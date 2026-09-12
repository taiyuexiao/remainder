import type { FastifyInstance } from 'fastify';
import { db } from '../db/connection.js';
import { now, uuid } from './helpers.js';
import { stripToText } from '../services/docSearch.js';
import { rebuildKnowledgeFts, searchKnowledge } from '../services/knowledgeSearch.js';
import { currentUser, isMember, PERSONAL_TEAM_ID, teamExists } from '../services/teams.js';
import { pushNotification } from '../scheduler/index.js';

const LIST_COLS =
  'id, type, title, team_id, project_id, author, owners, channels, tags, ttl, status, acl, notify, related, conclusion, useful_count, source_url, source_clip_id, source_doc_id, upstream_id, upstream_team, upstream_updated_at, ' +
  '(SELECT CASE WHEN u.updated_at > knowledge_items.upstream_updated_at THEN 1 ELSE 0 END FROM knowledge_items u WHERE u.id = knowledge_items.upstream_id) AS upstream_has_update, ' +
  'created_at, updated_at, expires_at';

interface KnowledgeBody {
  type?: string;
  title?: string;
  content?: string;
  team_id?: string;
  author?: string;
  owners?: string[];
  project_id?: string | null;
  channels?: string[];
  tags?: string[];
  ttl?: string;
  status?: string;
  acl?: string;
  notify?: string;
  related?: string[];
  conclusion?: string;
  useful_count?: number;
  source_url?: string;
  source_clip_id?: string;
  source_doc_id?: string;
}

const TYPES = new Set(['intel', 'share', 'note', 'rfc', 'guide', 'spec', 'adr']);
/** 各类型默认 TTL（天）；空 = 无过期 */
const DEFAULT_TTL_DAYS: Record<string, number | null> = {
  intel: 14, share: null, note: 180, rfc: 14, guide: 90, spec: null, adr: null,
};

/** 类型集合（agent 工具复用，M34 / A3） */
export const KB_TYPES = TYPES;

function computeExpiresAt(type: string, ttl?: string): string | null {
  if (ttl === 'never' || ttl === '') return null;
  if (ttl && /^\d{4}-\d{2}-\d{2}/.test(ttl)) return ttl;
  const days = ttl && /^\d+$/.test(ttl) ? Number(ttl) : (DEFAULT_TTL_DAYS[type] ?? null);
  if (!days) return null;
  return new Date(Date.now() + days * 86400000).toISOString();
}

/** agent 工具复用（M34 / A3）：按类型算过期时间 */
export { computeExpiresAt };

export default async function knowledgeRoutes(app: FastifyInstance) {
  // ── M28：agent 增强查询 ──

  // kb_constraints：聚合某主题的 spec + adr（adr 否决项置顶），agent 干活前必查
  app.get('/api/knowledge/constraints', async (req, reply) => {
    const { team, module } = req.query as { team?: string; module?: string };
    const teamId = team || PERSONAL_TEAM_ID;
    if (!teamExists(teamId)) return reply.code(404).send({ error: '团队不存在' });
    if (!isMember(teamId, currentUser(req))) return reply.code(403).send({ error: '不是该团队成员' });
    const like = `%${module ?? ''}%`;
    const rows = db.prepare(
      `SELECT ${LIST_COLS} FROM knowledge_items
       WHERE team_id = ? AND type IN ('spec','adr') AND status IN ('active','concluded')
         AND (title LIKE ? OR content_text LIKE ? OR tags LIKE ? OR channels LIKE ?)
       ORDER BY CASE type WHEN 'adr' THEN 0 ELSE 1 END, updated_at DESC LIMIT 20`,
    ).all(teamId, like, like, like, like);
    return rows;
  });

  // kb_who_knows：按 owners/作者统计回答“这事问谁”
  app.get('/api/knowledge/who-knows', async (req, reply) => {
    const { team, topic } = req.query as { team?: string; topic?: string };
    const teamId = team || PERSONAL_TEAM_ID;
    if (!teamExists(teamId)) return reply.code(404).send({ error: '团队不存在' });
    if (!isMember(teamId, currentUser(req))) return reply.code(403).send({ error: '不是该团队成员' });
    const items = searchKnowledge({ q: topic ?? '', teamId, status: 'any', hideExpired: false, limit: 100 }) as {
      author: string; owners: string; type: string;
    }[];
    const stat = new Map<string, { name: string; count: number; as_owner: number; types: Set<string> }>();
    const bump = (name: string, asOwner: boolean, type: string) => {
      if (!name) return;
      const s = stat.get(name) ?? { name, count: 0, as_owner: 0, types: new Set<string>() };
      s.count++; if (asOwner) s.as_owner++; s.types.add(type);
      stat.set(name, s);
    };
    for (const it of items) {
      bump(it.author, false, it.type);
      try { for (const o of JSON.parse(it.owners || '[]') as string[]) bump(o, true, it.type); } catch { /* ignore */ }
    }
    return [...stat.values()]
      .sort((a, b) => b.as_owner - a.as_owner || b.count - a.count)
      .map((s) => ({ name: s.name, item_count: s.count, as_owner_count: s.as_owner, types: [...s.types] }));
  });

  // 列表/搜索（?q=&type=&channel=&tag=&status=&includeExpired=1&team=）
  app.get('/api/knowledge', async (req, reply) => {
    const { q, type, channel, tag, status, includeExpired, team, project } = req.query as Record<string, string | undefined>;
    const teamId = team || PERSONAL_TEAM_ID;
    if (!teamExists(teamId)) return reply.code(404).send({ error: '团队不存在' });
    if (!isMember(teamId, currentUser(req))) return reply.code(403).send({ error: '不是该团队成员' });
    return searchKnowledge({
      q, type, channel, tag,
      status: status ?? 'active',
      hideExpired: includeExpired !== '1',
      teamId,
      projectId: project,
    });
  });

  // 单条
  app.get('/api/knowledge/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = db.prepare(`SELECT ${LIST_COLS}, content FROM knowledge_items WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    if (!row) return reply.code(404).send({ error: '条目不存在' });
    if (!isMember(row.team_id as string, currentUser(req))) return reply.code(403).send({ error: '不是该团队成员' });
    return row;
  });

  // 新建
  app.post('/api/knowledge', async (req, reply) => {
    const b = (req.body ?? {}) as KnowledgeBody;
    if (!b.title?.trim()) return reply.code(400).send({ error: 'title 必填' });
    const type = b.type && TYPES.has(b.type) ? b.type : 'note';
    const teamId = b.team_id || PERSONAL_TEAM_ID;
    if (!teamExists(teamId)) return reply.code(404).send({ error: '团队不存在' });
    const user = currentUser(req);
    if (!isMember(teamId, user)) return reply.code(403).send({ error: '不是该团队成员' });
    const id = uuid();
    const ts = now();
    const content = b.content ?? '';
    const status = b.status ?? (type === 'rfc' ? 'open' : 'active');
    // project_id 校验：须为同团队项目
    const projectId = b.project_id ?? null;
    if (projectId) {
      const p = db.prepare('SELECT team_id FROM kb_projects WHERE id = ?').get(projectId) as { team_id: string } | undefined;
      if (!p || p.team_id !== teamId) return reply.code(400).send({ error: 'project_id 非法（须为同团队项目）' });
    }
    db.prepare(
      `INSERT INTO knowledge_items
       (id,type,title,content,content_text,team_id,project_id,author,owners,channels,tags,ttl,status,acl,notify,related,source_url,source_clip_id,source_doc_id,created_at,updated_at,expires_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      id, type, b.title.trim(), content, stripToText(content), teamId, projectId,
      b.author || user, JSON.stringify(b.owners ?? []), JSON.stringify(b.channels ?? []),
      JSON.stringify(b.tags ?? []), b.ttl ?? '', status, b.acl ?? 'team', b.notify ?? 'digest',
      JSON.stringify(b.related ?? []), b.source_url ?? '', b.source_clip_id ?? null, b.source_doc_id ?? null,
      ts, ts, computeExpiresAt(type, b.ttl),
    );
    rebuildKnowledgeFts();
    // @人 P0 必达：owners 里的其他人收到通知
    for (const o of b.owners ?? []) {
      if (o && o !== user) pushNotification(`📚 ${user} 在知识条目「${b.title.trim()}」中 @ 了你`, id);
    }
    return reply.code(201).send(db.prepare(`SELECT ${LIST_COLS} FROM knowledge_items WHERE id = ?`).get(id));
  });

  // 更新
  app.patch('/api/knowledge/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const exist = db.prepare('SELECT id, type, team_id FROM knowledge_items WHERE id = ?').get(id) as { id: string; type: string; team_id: string } | undefined;
    if (!exist) return reply.code(404).send({ error: '条目不存在' });
    if (!isMember(exist.team_id, currentUser(req))) return reply.code(403).send({ error: '不是该团队成员' });
    const b = (req.body ?? {}) as KnowledgeBody;
    const sets: string[] = [];
    const params: unknown[] = [];
    const push = (col: string, val: unknown) => { sets.push(`${col} = ?`); params.push(val); };
    if (b.title !== undefined) push('title', b.title.trim());
    if (b.project_id !== undefined) {
      if (b.project_id) {
        const p = db.prepare('SELECT team_id FROM kb_projects WHERE id = ?').get(b.project_id) as { team_id: string } | undefined;
        if (!p || p.team_id !== exist.team_id) return reply.code(400).send({ error: 'project_id 非法（须为同团队项目）' });
      }
      push('project_id', b.project_id);
    }
    if (b.content !== undefined) { sets.push('content = ?', 'content_text = ?'); params.push(b.content, stripToText(b.content)); }
    if (b.author !== undefined) push('author', b.author);
    if (b.owners !== undefined) {
      push('owners', JSON.stringify(b.owners));
      const oldOwners = new Set(JSON.parse((db.prepare('SELECT owners FROM knowledge_items WHERE id = ?').get(id) as { owners: string }).owners || '[]') as string[]);
      const me = currentUser(req);
      for (const o of b.owners) {
        if (o && o !== me && !oldOwners.has(o)) {
          const t = db.prepare('SELECT title FROM knowledge_items WHERE id = ?').get(id) as { title: string };
          pushNotification(`📚 ${me} 在知识条目「${t.title}」中 @ 了你`, id);
        }
      }
    }
    if (b.channels !== undefined) push('channels', JSON.stringify(b.channels));
    if (b.tags !== undefined) push('tags', JSON.stringify(b.tags));
    if (b.ttl !== undefined) { push('ttl', b.ttl); push('expires_at', computeExpiresAt(exist.type, b.ttl)); }
    if (b.status !== undefined) push('status', b.status);
    if (b.acl !== undefined) push('acl', b.acl);
    if (b.notify !== undefined) push('notify', b.notify);
    if (b.related !== undefined) push('related', JSON.stringify(b.related));
    if (b.conclusion !== undefined) push('conclusion', b.conclusion);
    if (b.useful_count !== undefined) push('useful_count', b.useful_count);
    if (sets.length) {
      sets.push('updated_at = ?'); params.push(now(), id);
      db.prepare(`UPDATE knowledge_items SET ${sets.join(',')} WHERE id = ?`).run(...params);
      rebuildKnowledgeFts();
    }
    return db.prepare(`SELECT ${LIST_COLS} FROM knowledge_items WHERE id = ?`).get(id);
  });

  // rfc 标记结论（结论回填 + 状态 concluded + 可一键转 note/adr）
  app.post('/api/knowledge/:id/conclude', async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as { conclusion?: string; promoteTo?: 'note' | 'adr' };
    const row = db.prepare('SELECT * FROM knowledge_items WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!row) return reply.code(404).send({ error: '条目不存在' });
    if (!isMember(row.team_id as string, currentUser(req))) return reply.code(403).send({ error: '不是该团队成员' });
    if (row.type !== 'rfc') return reply.code(400).send({ error: '仅 rfc 类型可标记结论' });
    const ts = now();
    db.prepare(`UPDATE knowledge_items SET status='concluded', conclusion=?, updated_at=? WHERE id=?`)
      .run(b.conclusion ?? '', ts, id);
    rebuildKnowledgeFts();

    let promoted: unknown = null;
    if (b.promoteTo) {
      // 一键沉淀：rfc 结论 → note 或 adr
      const newId = uuid();
      const content = `> 来源探讨：${row.title}\n\n${b.conclusion ?? ''}\n\n---\n\n${row.content ?? ''}`;
      db.prepare(
        `INSERT INTO knowledge_items
         (id,type,title,content,content_text,team_id,author,owners,channels,tags,ttl,status,acl,notify,related,source_url,created_at,updated_at,expires_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        newId, b.promoteTo, row.title, content, stripToText(content), row.team_id,
        row.author, row.owners, row.channels, row.tags,
        b.promoteTo === 'note' ? '180d' : '', 'active', row.acl, row.notify,
        JSON.stringify([id]), row.source_url, ts, ts,
        computeExpiresAt(b.promoteTo, b.promoteTo === 'note' ? '180' : ''),
      );
      rebuildKnowledgeFts();
      promoted = db.prepare(`SELECT ${LIST_COLS} FROM knowledge_items WHERE id = ?`).get(newId);
    }
    return { concluded: db.prepare(`SELECT ${LIST_COLS} FROM knowledge_items WHERE id = ?`).get(id), promoted };
  });

  // 「有用」+1
  app.post('/api/knowledge/:id/useful', async (req, reply) => {
    const { id } = req.params as { id: string };
    const item = db.prepare('SELECT team_id FROM knowledge_items WHERE id = ?').get(id) as { team_id: string } | undefined;
    if (!item) return reply.code(404).send({ error: '条目不存在' });
    if (!isMember(item.team_id, currentUser(req))) return reply.code(403).send({ error: '不是该团队成员' });
    db.prepare('UPDATE knowledge_items SET useful_count = useful_count + 1, updated_at = ? WHERE id = ?').run(now(), id);
    return db.prepare(`SELECT ${LIST_COLS} FROM knowledge_items WHERE id = ?`).get(id);
  });

  // 删除
  app.delete('/api/knowledge/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const item = db.prepare('SELECT team_id FROM knowledge_items WHERE id = ?').get(id) as { team_id: string } | undefined;
    if (!item) return reply.code(404).send({ error: '条目不存在' });
    if (!isMember(item.team_id, currentUser(req))) return reply.code(403).send({ error: '不是该团队成员' });
    db.prepare('DELETE FROM knowledge_items WHERE id = ?').run(id);
    rebuildKnowledgeFts();
    return { deleted: id };
  });
}
