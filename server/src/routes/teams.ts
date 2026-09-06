import type { FastifyInstance } from 'fastify';
import { db } from '../db/connection.js';
import { now, uuid } from './helpers.js';
import { currentUser, isAdmin, isMember, PERSONAL_TEAM_ID, roleOf, teamExists } from '../services/teams.js';

/** 生成短邀请码（8 位，去掉易混淆字符） */
function genInviteToken(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export default async function teamRoutes(app: FastifyInstance) {
  // 我的团队列表（含个人空间置顶）
  app.get('/api/teams', async (req) => {
    const user = currentUser(req);
    const rows = db
      .prepare(
        `SELECT t.id, t.name, t.description, t.created_by, t.created_at,
                (SELECT COUNT(*) FROM team_members m WHERE m.team_id = t.id) AS member_count,
                (SELECT COUNT(*) FROM knowledge_items k WHERE k.team_id = t.id AND k.status != 'archived') AS item_count
         FROM teams t
         WHERE t.id = ? OR EXISTS (SELECT 1 FROM team_members m WHERE m.team_id = t.id AND m.user_name = ?)
         ORDER BY t.created_at ASC`,
      )
      .all(PERSONAL_TEAM_ID, user) as Record<string, unknown>[];
    return rows.map((r) => ({ ...r, my_role: roleOf(r.id as string, user) }));
  });

  // 新建团队（创建者=owner）
  app.post('/api/teams', async (req, reply) => {
    const b = (req.body ?? {}) as { name?: string; description?: string };
    if (!b.name?.trim()) return reply.code(400).send({ error: 'name 必填' });
    const user = currentUser(req);
    const id = uuid();
    const ts = now();
    db.prepare(
      'INSERT INTO teams (id, name, description, invite_token, created_by, created_at) VALUES (?,?,?,?,?,?)',
    ).run(id, b.name.trim(), b.description ?? '', genInviteToken(), user, ts);
    db.prepare('INSERT INTO team_members (team_id, user_name, role, joined_at) VALUES (?,?,?,?)').run(
      id, user, 'owner', ts,
    );
    return reply.code(201).send({ id, name: b.name.trim(), my_role: 'owner' });
  });

  // 凭邀请码加入
  app.post('/api/teams/join', async (req, reply) => {
    const b = (req.body ?? {}) as { invite_token?: string };
    const token = (b.invite_token ?? '').trim().toUpperCase();
    if (!token) return reply.code(400).send({ error: 'invite_token 必填' });
    const team = db.prepare('SELECT id, name FROM teams WHERE invite_token = ?').get(token) as
      | { id: string; name: string }
      | undefined;
    if (!team) return reply.code(404).send({ error: '邀请码无效' });
    const user = currentUser(req);
    db.prepare(
      'INSERT OR IGNORE INTO team_members (team_id, user_name, role, joined_at) VALUES (?,?,?,?)',
    ).run(team.id, user, 'member', now());
    return { id: team.id, name: team.name, my_role: roleOf(team.id, user) };
  });

  // 团队详情 + 成员（仅成员可见；邀请码仅 admin+ 可见）
  app.get('/api/teams/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = currentUser(req);
    if (!teamExists(id)) return reply.code(404).send({ error: '团队不存在' });
    if (!isMember(id, user)) return reply.code(403).send({ error: '不是该团队成员' });
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(id) as Record<string, unknown>;
    let members = db
      .prepare('SELECT user_name, role, joined_at FROM team_members WHERE team_id = ? ORDER BY joined_at')
      .all(id);
    // 个人空间无成员记录：合成「我」让 @负责人 选择器可用
    if (id === PERSONAL_TEAM_ID && (members as unknown[]).length === 0) {
      members = [{ user_name: user, role: 'owner', joined_at: team.created_at }];
    }
    const admin = isAdmin(id, user);
    return {
      ...team,
      invite_token: admin ? team.invite_token : undefined,
      members,
      my_role: roleOf(id, user),
    };
  });

  // 重命名/改简介（admin+）
  app.patch('/api/teams/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = currentUser(req);
    if (!teamExists(id)) return reply.code(404).send({ error: '团队不存在' });
    if (id === PERSONAL_TEAM_ID) return reply.code(400).send({ error: '个人空间不可修改' });
    if (!isAdmin(id, user)) return reply.code(403).send({ error: '需要管理员权限' });
    const b = (req.body ?? {}) as { name?: string; description?: string };
    if (b.name !== undefined) db.prepare('UPDATE teams SET name = ? WHERE id = ?').run(b.name.trim() || '未命名团队', id);
    if (b.description !== undefined) db.prepare('UPDATE teams SET description = ? WHERE id = ?').run(b.description, id);
    return db.prepare('SELECT id, name, description FROM teams WHERE id = ?').get(id);
  });

  // 添加成员（admin+，按姓名直接加；成员也可通过邀请码自行加入）
  app.post('/api/teams/:id/members', async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = currentUser(req);
    if (!teamExists(id)) return reply.code(404).send({ error: '团队不存在' });
    if (!isAdmin(id, user)) return reply.code(403).send({ error: '需要管理员权限' });
    const b = (req.body ?? {}) as { user_name?: string; role?: string };
    const name = (b.user_name ?? '').trim();
    if (!name) return reply.code(400).send({ error: 'user_name 必填' });
    const role = b.role === 'admin' ? 'admin' : 'member';
    db.prepare('INSERT OR IGNORE INTO team_members (team_id, user_name, role, joined_at) VALUES (?,?,?,?)').run(
      id, name, role, now(),
    );
    return reply.code(201).send({ team_id: id, user_name: name, role });
  });

  // 调整成员角色（admin+；owner 不可被降级）
  app.patch('/api/teams/:id/members/:user', async (req, reply) => {
    const { id, user: target } = req.params as { id: string; user: string };
    const me = currentUser(req);
    if (!isAdmin(id, me)) return reply.code(403).send({ error: '需要管理员权限' });
    const b = (req.body ?? {}) as { role?: string };
    if (b.role !== 'admin' && b.role !== 'member') return reply.code(400).send({ error: 'role 仅支持 admin/member' });
    const cur = roleOf(id, target);
    if (!cur) return reply.code(404).send({ error: '成员不存在' });
    if (cur === 'owner') return reply.code(400).send({ error: 'owner 不可被降级' });
    db.prepare('UPDATE team_members SET role = ? WHERE team_id = ? AND user_name = ?').run(b.role, id, target);
    return { team_id: id, user_name: target, role: b.role };
  });

  // 移除成员（admin+ 或自己退出；owner 不可被移除）
  app.delete('/api/teams/:id/members/:user', async (req, reply) => {
    const { id, user: target } = req.params as { id: string; user: string };
    const me = currentUser(req);
    if (!(isAdmin(id, me) || me === target)) return reply.code(403).send({ error: '需要管理员权限' });
    if (roleOf(id, target) === 'owner') return reply.code(400).send({ error: 'owner 不可被移除' });
    const r = db.prepare('DELETE FROM team_members WHERE team_id = ? AND user_name = ?').run(id, target);
    if (r.changes === 0) return reply.code(404).send({ error: '成员不存在' });
    return { removed: target };
  });

  // 重新生成邀请码（admin+）
  app.post('/api/teams/:id/rotate-invite', async (req, reply) => {
    const { id } = req.params as { id: string };
    const me = currentUser(req);
    if (!isAdmin(id, me)) return reply.code(403).send({ error: '需要管理员权限' });
    if (id === PERSONAL_TEAM_ID) return reply.code(400).send({ error: '个人空间无邀请码' });
    const token = genInviteToken();
    db.prepare('UPDATE teams SET invite_token = ? WHERE id = ?').run(token, id);
    return { invite_token: token };
  });

  // 删除团队（owner；须先清空知识条目）
  app.delete('/api/teams/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const me = currentUser(req);
    if (id === PERSONAL_TEAM_ID) return reply.code(400).send({ error: '个人空间不可删除' });
    if (roleOf(id, me) !== 'owner') return reply.code(403).send({ error: '仅 owner 可删除团队' });
    const cnt = db.prepare('SELECT COUNT(*) AS c FROM knowledge_items WHERE team_id = ?').get(id) as { c: number };
    if (cnt.c > 0) return reply.code(400).send({ error: `团队内还有 ${cnt.c} 条知识条目，请先清空或归档` });
    db.prepare('DELETE FROM teams WHERE id = ?').run(id);
    return { deleted: id };
  });
}
