import type { FastifyInstance } from 'fastify';
import { db } from '../db/connection.js';
import { now, uuid } from './helpers.js';
import { currentUser, isAdmin, isMember } from '../services/teams.js';
import { pushNotification } from '../scheduler/index.js';

/** 条目评论（M26 / K3）：楼中楼（parent_id）+ 评论内 @团队成员 → P0 必达 */

function itemTeam(itemId: string): { team_id: string; title: string } | undefined {
  return db.prepare('SELECT team_id, title FROM knowledge_items WHERE id = ?').get(itemId) as
    | { team_id: string; title: string }
    | undefined;
}

export default async function commentRoutes(app: FastifyInstance) {
  // 评论列表
  app.get('/api/knowledge/:id/comments', async (req, reply) => {
    const { id } = req.params as { id: string };
    const item = itemTeam(id);
    if (!item) return reply.code(404).send({ error: '条目不存在' });
    if (!isMember(item.team_id, currentUser(req))) return reply.code(403).send({ error: '不是该团队成员' });
    return db
      .prepare('SELECT id, item_id, parent_id, author, content, created_at FROM comments WHERE item_id = ? ORDER BY created_at')
      .all(id);
  });

  // 发评论（content 里 @名字 命中团队成员 → 必达通知）
  app.post('/api/knowledge/:id/comments', async (req, reply) => {
    const { id } = req.params as { id: string };
    const item = itemTeam(id);
    if (!item) return reply.code(404).send({ error: '条目不存在' });
    const user = currentUser(req);
    if (!isMember(item.team_id, user)) return reply.code(403).send({ error: '不是该团队成员' });
    const b = (req.body ?? {}) as { content?: string; parent_id?: string };
    if (!b.content?.trim()) return reply.code(400).send({ error: 'content 必填' });
    if (b.parent_id) {
      const p = db.prepare('SELECT id FROM comments WHERE id = ? AND item_id = ?').get(b.parent_id, id);
      if (!p) return reply.code(400).send({ error: 'parent_id 非法' });
    }
    const cid = uuid();
    db.prepare('INSERT INTO comments (id, item_id, parent_id, author, content, created_at) VALUES (?,?,?,?,?,?)').run(
      cid, id, b.parent_id ?? null, user, b.content.trim(), now(),
    );
    // @提及 → P0 必达（个人空间视为全部本机用户可 @，但只通知真实成员名单里的名字）
    const members =
      item.team_id === 'personal'
        ? []
        : (db.prepare('SELECT user_name FROM team_members WHERE team_id = ?').all(item.team_id) as { user_name: string }[]);
    for (const m of members) {
      if (m.user_name !== user && b.content.includes(`@${m.user_name}`)) {
        pushNotification(`💬 ${user} 在「${item.title}」的评论中 @ 了你`, id);
      }
    }
    return reply.code(201).send(
      db.prepare('SELECT id, item_id, parent_id, author, content, created_at FROM comments WHERE id = ?').get(cid),
    );
  });

  // 删评论（作者本人或团队 admin+）
  app.delete('/api/comments/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = db.prepare('SELECT c.author, k.team_id FROM comments c JOIN knowledge_items k ON k.id = c.item_id WHERE c.id = ?').get(id) as
      | { author: string; team_id: string }
      | undefined;
    if (!c) return reply.code(404).send({ error: '评论不存在' });
    const user = currentUser(req);
    if (c.author !== user && !isAdmin(c.team_id, user)) return reply.code(403).send({ error: '仅作者或管理员可删除' });
    db.prepare('DELETE FROM comments WHERE id = ?').run(id);
    return { deleted: id };
  });
}
