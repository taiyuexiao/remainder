import type { FastifyInstance } from 'fastify';
import { db } from '../db/connection.js';
import { now, uuid } from './helpers.js';
import { currentUser, isMember, PERSONAL_TEAM_ID, teamExists } from '../services/teams.js';
import { pushNotification } from '../scheduler/index.js';

/**
 * 工作库项目（M25 / K2）：项目 → 子项目 → 条目 三层树。
 * 与任务模块的 projects 表无关（那是任务项目）；这里是知识库自己的项目树，按 team_id 隔离。
 */

const COLS = 'id, team_id, name, description, parent_id, owners, status, sort_order, created_at, updated_at';

interface ProjectBody {
  name?: string;
  description?: string;
  team_id?: string;
  parent_id?: string | null;
  owners?: string[];
  status?: string;
}

/** 同一团队内校验 parent 合法（防跨团队挂树/环） */
function validParent(teamId: string, parentId: string | null | undefined, selfId?: string): boolean {
  if (!parentId) return true;
  if (parentId === selfId) return false;
  const p = db.prepare('SELECT team_id, parent_id FROM kb_projects WHERE id = ?').get(parentId) as
    | { team_id: string; parent_id: string | null }
    | undefined;
  if (!p || p.team_id !== teamId) return false;
  // 防环：沿父链向上最多 10 层
  let cur: string | null = p.parent_id;
  for (let i = 0; i < 10 && cur; i++) {
    if (cur === selfId) return false;
    const row = db.prepare('SELECT parent_id FROM kb_projects WHERE id = ?').get(cur) as { parent_id: string | null } | undefined;
    cur = row?.parent_id ?? null;
  }
  return true;
}

export default async function kbProjectRoutes(app: FastifyInstance) {
  // 项目列表（平铺返回，客户端组树）
  app.get('/api/kb-projects', async (req, reply) => {
    const { team } = req.query as { team?: string };
    const teamId = team || PERSONAL_TEAM_ID;
    if (!teamExists(teamId)) return reply.code(404).send({ error: '团队不存在' });
    if (!isMember(teamId, currentUser(req))) return reply.code(403).send({ error: '不是该团队成员' });
    return db
      .prepare(
        `SELECT ${COLS},
                (SELECT COUNT(*) FROM knowledge_items k WHERE k.project_id = p.id AND k.status != 'archived') AS item_count
         FROM kb_projects p WHERE p.team_id = ? AND p.status != 'archived'
         ORDER BY p.sort_order, p.created_at`,
      )
      .all(teamId);
  });

  // 新建项目/子项目
  app.post('/api/kb-projects', async (req, reply) => {
    const b = (req.body ?? {}) as ProjectBody;
    if (!b.name?.trim()) return reply.code(400).send({ error: 'name 必填' });
    const teamId = b.team_id || PERSONAL_TEAM_ID;
    if (!teamExists(teamId)) return reply.code(404).send({ error: '团队不存在' });
    const user = currentUser(req);
    if (!isMember(teamId, user)) return reply.code(403).send({ error: '不是该团队成员' });
    if (!validParent(teamId, b.parent_id)) return reply.code(400).send({ error: 'parent_id 非法（须为同团队项目）' });
    const id = uuid();
    const ts = now();
    db.prepare(
      `INSERT INTO kb_projects (id, team_id, name, description, parent_id, owners, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).run(id, teamId, b.name.trim(), b.description ?? '', b.parent_id ?? null, JSON.stringify(b.owners ?? []), ts, ts);
    // @人 P0 必达
    for (const o of b.owners ?? []) {
      if (o && o !== user) pushNotification(`📐 ${user} 在知识库项目「${b.name.trim()}」中 @ 了你`, id);
    }
    return reply.code(201).send(db.prepare(`SELECT ${COLS} FROM kb_projects WHERE id = ?`).get(id));
  });

  // 更新（重命名/简介/@负责人/移动/归档）
  app.patch('/api/kb-projects/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const exist = db.prepare(`SELECT ${COLS} FROM kb_projects WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!exist) return reply.code(404).send({ error: '项目不存在' });
    const user = currentUser(req);
    if (!isMember(exist.team_id as string, user)) return reply.code(403).send({ error: '不是该团队成员' });
    const b = (req.body ?? {}) as ProjectBody;
    const sets: string[] = [];
    const params: unknown[] = [];
    if (b.name !== undefined) { sets.push('name = ?'); params.push(b.name.trim() || exist.name); }
    if (b.description !== undefined) { sets.push('description = ?'); params.push(b.description); }
    if (b.parent_id !== undefined) {
      if (!validParent(exist.team_id as string, b.parent_id, id)) return reply.code(400).send({ error: 'parent_id 非法' });
      sets.push('parent_id = ?'); params.push(b.parent_id);
    }
    if (b.owners !== undefined) {
      const oldOwners = new Set(JSON.parse((exist.owners as string) || '[]') as string[]);
      sets.push('owners = ?'); params.push(JSON.stringify(b.owners));
      for (const o of b.owners) {
        if (o && o !== user && !oldOwners.has(o)) {
          pushNotification(`📐 ${user} 在知识库项目「${b.name ?? exist.name}」中 @ 了你`, id);
        }
      }
    }
    if (b.status === 'active' || b.status === 'archived') { sets.push('status = ?'); params.push(b.status); }
    if (sets.length) {
      sets.push('updated_at = ?'); params.push(now(), id);
      db.prepare(`UPDATE kb_projects SET ${sets.join(',')} WHERE id = ?`).run(...params);
    }
    return db.prepare(`SELECT ${COLS} FROM kb_projects WHERE id = ?`).get(id);
  });

  // 删除（须无子项目且无条目）
  app.delete('/api/kb-projects/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const exist = db.prepare('SELECT team_id, name FROM kb_projects WHERE id = ?').get(id) as
      | { team_id: string; name: string }
      | undefined;
    if (!exist) return reply.code(404).send({ error: '项目不存在' });
    if (!isMember(exist.team_id, currentUser(req))) return reply.code(403).send({ error: '不是该团队成员' });
    const children = db.prepare('SELECT COUNT(*) AS c FROM kb_projects WHERE parent_id = ?').get(id) as { c: number };
    if (children.c > 0) return reply.code(400).send({ error: `还有 ${children.c} 个子项目，请先删除` });
    const items = db.prepare('SELECT COUNT(*) AS c FROM knowledge_items WHERE project_id = ?').get(id) as { c: number };
    if (items.c > 0) return reply.code(400).send({ error: `项目内还有 ${items.c} 条条目，请先移出或删除` });
    db.prepare('DELETE FROM kb_projects WHERE id = ?').run(id);
    return { deleted: id };
  });
}
