import type { FastifyRequest } from 'fastify';
import { db } from '../db/connection.js';

/**
 * 团队与成员（M24）。
 * 身份模型：LAN 信任制——客户端经 `x-user-name` 头自报姓名，节点上同名即同人。
 * 个人空间（team_id='personal'）为特殊团队：节点上所有用户默认可读写（单机零配置）。
 */

export const PERSONAL_TEAM_ID = 'personal';

export type TeamRole = 'owner' | 'admin' | 'member';

/** 从请求头解析当前用户（缺省=本机用户）。客户端对中文名做了 encodeURIComponent */
export function currentUser(req: FastifyRequest): string {
  const h = req.headers['x-user-name'];
  let name = (Array.isArray(h) ? h[0] : h ?? '').trim();
  try { name = decodeURIComponent(name); } catch { /* 未编码时原样使用 */ }
  return name || '本机用户';
}

/** 用户在某团队的角色；非成员返回 null。个人空间所有人都是 owner（无管理限制）。 */
export function roleOf(teamId: string, user: string): TeamRole | null {
  if (teamId === PERSONAL_TEAM_ID) return 'owner';
  const row = db
    .prepare('SELECT role FROM team_members WHERE team_id = ? AND user_name = ?')
    .get(teamId, user) as { role: TeamRole } | undefined;
  return row?.role ?? null;
}

export function isMember(teamId: string, user: string): boolean {
  return roleOf(teamId, user) !== null;
}

export function isAdmin(teamId: string, user: string): boolean {
  const r = roleOf(teamId, user);
  return r === 'owner' || r === 'admin';
}

export function teamExists(teamId: string): boolean {
  return !!db.prepare('SELECT id FROM teams WHERE id = ?').get(teamId);
}
