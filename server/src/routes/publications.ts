import type { FastifyInstance } from 'fastify';
import { db } from '../db/connection.js';
import { now, uuid } from './helpers.js';
import { currentUser, isMember, teamExists } from '../services/teams.js';
import { pushNotification } from '../scheduler/index.js';
import { stripToText } from '../services/docSearch.js';
import { rebuildKnowledgeFts } from '../services/knowledgeSearch.js';

/**
 * 发布/同步（M27 / K4，v3 §2.3）。
 * 发布 ≠ 复制：发布 = 给目标团队可见权 + 进对方收件箱；对方三选：仅查看 / 同步副本（fork 记 upstream）/ 忽略。
 * 红线：上游删除不回删下游副本。
 */

const PUB_COLS =
  'p.id, p.item_id, p.from_team, p.to_team, p.from_author, p.source_updated_at, p.status, p.synced_item_id, p.resolved_by, p.published_at, p.resolved_at';

export default async function publicationRoutes(app: FastifyInstance) {
  // 发布条目到目标团队（须同时是两个团队的成员）
  app.post('/api/knowledge/:id/publish', async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as { to_team?: string };
    const item = db.prepare('SELECT * FROM knowledge_items WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!item) return reply.code(404).send({ error: '条目不存在' });
    const toTeam = (b.to_team ?? '').trim();
    if (!toTeam || !teamExists(toTeam)) return reply.code(400).send({ error: 'to_team 非法' });
    if (toTeam === item.team_id) return reply.code(400).send({ error: '不能发布到本团队' });
    const user = currentUser(req);
    if (!isMember(item.team_id as string, user)) return reply.code(403).send({ error: '不是源团队成员' });
    if (!isMember(toTeam, user)) return reply.code(403).send({ error: '不是目标团队成员' });
    // 同一条目对同一团队只允许一条未处理的发布
    const dup = db
      .prepare(`SELECT id FROM publications WHERE item_id = ? AND to_team = ? AND status = 'pending'`)
      .get(id, toTeam);
    if (dup) return reply.code(400).send({ error: '该条目已在对方收件箱待处理' });
    const pid = uuid();
    db.prepare(
      `INSERT INTO publications (id, item_id, from_team, to_team, from_author, source_updated_at, published_at)
       VALUES (?,?,?,?,?,?,?)`,
    ).run(pid, id, item.team_id, toTeam, user, item.updated_at, now());
    // 通知目标团队其他成员
    const members = db.prepare('SELECT user_name FROM team_members WHERE team_id = ?').all(toTeam) as { user_name: string }[];
    for (const m of members) {
      if (m.user_name !== user) pushNotification(`📤 ${user} 发布了「${item.title}」到本团队收件箱`, pid);
    }
    return reply.code(201).send(db.prepare(`SELECT ${PUB_COLS} FROM publications p WHERE p.id = ?`).get(pid));
  });

  // 收件箱：某团队收到的发布（pending 优先）
  app.get('/api/publications', async (req, reply) => {
    const { team } = req.query as { team?: string };
    if (!team || !teamExists(team)) return reply.code(400).send({ error: 'team 必填' });
    if (!isMember(team, currentUser(req))) return reply.code(403).send({ error: '不是该团队成员' });
    return db
      .prepare(
        `SELECT ${PUB_COLS}, k.title AS item_title, k.type AS item_type,
                (SELECT name FROM teams WHERE id = p.from_team) AS from_team_name
         FROM publications p JOIN knowledge_items k ON k.id = p.item_id
         WHERE p.to_team = ?
         ORDER BY CASE p.status WHEN 'pending' THEN 0 ELSE 1 END, p.published_at DESC`,
      )
      .all(team);
  });

  // 收件箱未处理数（菜单角标）
  app.get('/api/publications/count', async (req, reply) => {
    const { team } = req.query as { team?: string };
    if (!team || !teamExists(team)) return reply.code(400).send({ error: 'team 必填' });
    if (!isMember(team, currentUser(req))) return reply.code(403).send({ error: '不是该团队成员' });
    return db
      .prepare(`SELECT COUNT(*) AS c FROM publications WHERE to_team = ? AND status = 'pending'`)
      .get(team);
  });

  // 仅查看：发布给了可见权，收件方成员可读全文（无需源团队成员身份）
  app.get('/api/publications/:id/item', async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = db.prepare(`SELECT ${PUB_COLS} FROM publications p WHERE p.id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!p) return reply.code(404).send({ error: '发布记录不存在' });
    const user = currentUser(req);
    if (!isMember(p.to_team as string, user)) return reply.code(403).send({ error: '不是收件团队成员' });
    const item = db.prepare('SELECT * FROM knowledge_items WHERE id = ?').get(p.item_id) as Record<string, unknown> | undefined;
    if (!item) return reply.code(410).send({ error: '上游条目已删除' });
    if (p.status === 'pending') {
      db.prepare(`UPDATE publications SET status = 'viewed', resolved_by = ?, resolved_at = ? WHERE id = ?`).run(user, now(), id);
    }
    return item;
  });

  // 忽略
  app.post('/api/publications/:id/ignore', async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = db.prepare('SELECT to_team, status FROM publications WHERE id = ?').get(id) as
      | { to_team: string; status: string }
      | undefined;
    if (!p) return reply.code(404).send({ error: '发布记录不存在' });
    const user = currentUser(req);
    if (!isMember(p.to_team, user)) return reply.code(403).send({ error: '不是收件团队成员' });
    if (p.status === 'synced') return reply.code(400).send({ error: '已同步的发布不可忽略' });
    db.prepare(`UPDATE publications SET status = 'ignored', resolved_by = ?, resolved_at = ? WHERE id = ?`).run(user, now(), id);
    return db.prepare(`SELECT ${PUB_COLS} FROM publications p WHERE p.id = ?`).get(id);
  });

  // 同步进我的团队库：拉副本，记 upstream 指针
  app.post('/api/publications/:id/sync', async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = db.prepare(`SELECT ${PUB_COLS} FROM publications p WHERE p.id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!p) return reply.code(404).send({ error: '发布记录不存在' });
    const user = currentUser(req);
    if (!isMember(p.to_team as string, user)) return reply.code(403).send({ error: '不是收件团队成员' });
    if (p.status === 'synced') return reply.code(400).send({ error: '已同步过' });
    if (p.status === 'ignored') return reply.code(400).send({ error: '已忽略' });
    const src = db.prepare('SELECT * FROM knowledge_items WHERE id = ?').get(p.item_id) as Record<string, unknown> | undefined;
    if (!src) return reply.code(410).send({ error: '上游条目已删除' });
    const newId = uuid();
    const ts = now();
    db.prepare(
      `INSERT INTO knowledge_items
       (id,type,title,content,content_text,team_id,project_id,author,owners,channels,tags,ttl,status,acl,notify,related,source_url,created_at,updated_at,expires_at,upstream_id,upstream_team,upstream_updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      newId, src.type, src.title, src.content, src.content_text, p.to_team, null,
      src.author, src.owners, src.channels, src.tags, src.ttl, 'active', src.acl, src.notify,
      JSON.stringify([p.item_id]), src.source_url, ts, ts, src.expires_at,
      p.item_id, p.from_team, src.updated_at,
    );
    rebuildKnowledgeFts();
    db.prepare(`UPDATE publications SET status = 'synced', synced_item_id = ?, resolved_by = ?, resolved_at = ? WHERE id = ?`)
      .run(newId, user, ts, id);
    return reply.code(201).send({
      publication: db.prepare(`SELECT ${PUB_COLS} FROM publications p WHERE p.id = ?`).get(id),
      item: db.prepare('SELECT id, title, team_id, upstream_id FROM knowledge_items WHERE id = ?').get(newId),
    });
  });

  // 一键拉新：副本从上游拉最新内容（发布授权持续有效；上游删除则 410 不回删副本——红线）
  app.post('/api/knowledge/:id/pull', async (req, reply) => {
    const { id } = req.params as { id: string };
    const copy = db.prepare('SELECT * FROM knowledge_items WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!copy) return reply.code(404).send({ error: '条目不存在' });
    if (!copy.upstream_id) return reply.code(400).send({ error: '该条目不是同步副本' });
    if (!isMember(copy.team_id as string, currentUser(req))) return reply.code(403).send({ error: '不是该团队成员' });
    const src = db.prepare('SELECT * FROM knowledge_items WHERE id = ?').get(copy.upstream_id) as Record<string, unknown> | undefined;
    if (!src) return reply.code(410).send({ error: '上游条目已删除（副本保留）' });
    db.prepare(
      `UPDATE knowledge_items SET title = ?, content = ?, content_text = ?, tags = ?, channels = ?,
       expires_at = ?, upstream_updated_at = ?, updated_at = ? WHERE id = ?`,
    ).run(src.title, src.content, stripToText(src.content as string), src.tags, src.channels, src.expires_at, src.updated_at, now(), id);
    rebuildKnowledgeFts();
    return db.prepare('SELECT id, title, upstream_updated_at FROM knowledge_items WHERE id = ?').get(id);
  });
}
