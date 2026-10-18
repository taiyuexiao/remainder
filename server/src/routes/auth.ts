import type { FastifyInstance } from 'fastify';
import { db } from '../db/connection.js';
import { hashPassword } from '../auth/password.js';
import { issueAccessToken, newRefreshToken, refreshTokenHash } from '../auth/tokens.js';
import {
  authenticate,
  consumeInvite,
  consumeRefreshToken,
  createInvite,
  createSession,
  ensureBootstrapUser,
  publicUser,
  revokeSession,
  userCount,
  type UserRow,
} from '../auth/service.js';
import { now, uuid } from './helpers.js';

interface RegisterBody {
  username?: string;
  email?: string;
  password?: string;
  inviteCode?: string;
}

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export default async function authRoutes(app: FastifyInstance) {
  await ensureBootstrapUser();

  app.post('/api/auth/register', async (req, reply) => {
    const b = (req.body ?? {}) as RegisterBody;
    const username = normalizeUsername(b.username ?? '');
    const password = b.password ?? '';
    if (!/^[a-z0-9_][a-z0-9_.-]{2,31}$/.test(username))
      return reply.code(400).send({ error: '用户名需为 3-32 位小写字母、数字、_ . -' });
    if (password.length < 10) return reply.code(400).send({ error: '密码至少 10 位' });

    const count = userCount();
    if (count > 0 && !b.inviteCode) return reply.code(403).send({ error: '需要邀请码' });
    if (count > 0 && !consumeInvite(b.inviteCode!)) return reply.code(403).send({ error: '邀请码无效或已过期' });

    const exists = db.prepare('SELECT id FROM users WHERE username = ? OR (email IS NOT NULL AND email = ?)')
      .get(username, b.email?.trim() || null);
    if (exists) return reply.code(409).send({ error: '用户名或邮箱已存在' });

    const id = `u_${uuid()}`;
    const ts = now();
    db.prepare(
      `INSERT INTO users (id,username,email,password_hash,role,must_change_password,disabled,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).run(id, username, b.email?.trim() || null, await hashPassword(password), count === 0 ? 'owner' : 'member', 0, 0, ts, ts);
    return reply.code(201).send({ id, username, role: count === 0 ? 'owner' : 'member' });
  });

  app.post('/api/auth/login', async (req, reply) => {
    const b = (req.body ?? {}) as { identifier?: string; username?: string; password?: string };
    const identifier = b.identifier ?? b.username ?? '';
    const row = await authenticate(identifier, b.password ?? '');
    if (!row) return reply.code(401).send({ error: '用户名或密码错误' });
    const session = createSession(row.id, String(req.headers['user-agent'] ?? ''));
    return {
      user: publicUser(row),
      accessToken: issueAccessToken({ id: row.id, username: row.username, email: row.email, role: row.role }),
      refreshToken: session.token,
      expiresAt: session.expiresAt,
    };
  });

  app.post('/api/auth/refresh', async (req, reply) => {
    const b = (req.body ?? {}) as { refreshToken?: string };
    if (!b.refreshToken) return reply.code(400).send({ error: 'refreshToken 必填' });
    const row = consumeRefreshToken(b.refreshToken);
    if (!row) return reply.code(401).send({ error: '刷新登录已失效' });
    const session = createSession(row.id, String(req.headers['user-agent'] ?? ''));
    return {
      user: publicUser(row),
      accessToken: issueAccessToken({ id: row.id, username: row.username, email: row.email, role: row.role }),
      refreshToken: session.token,
      expiresAt: session.expiresAt,
    };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const b = (req.body ?? {}) as { refreshToken?: string };
    if (b.refreshToken) revokeSession(b.refreshToken);
    return reply.code(204).send();
  });

  app.get('/api/auth/me', async (req) => {
    if (!req.authUser) return null;
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.authUser.id) as UserRow | undefined;
    return row ? publicUser(row) : null;
  });

  app.post('/api/auth/invites', async (req, reply) => {
    if (!req.authUser || req.authUser.role === 'member')
      return reply.code(403).send({ error: '仅管理员可创建邀请码' });
    return reply.code(201).send(createInvite(req.authUser.id));
  });
}
