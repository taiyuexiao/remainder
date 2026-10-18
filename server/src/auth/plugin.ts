import type { FastifyInstance, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { db } from '../db/connection.js';
import { verifyAccessToken, type AuthUser } from './tokens.js';
import { publicUser, type UserRow } from './service.js';

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthUser & { must_change_password?: boolean };
  }
}

const PUBLIC_PATHS = new Set([
  '/api/health',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
]);

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost', '::ffff:127.0.0.1']);

export function bearerUser(req: FastifyRequest): (AuthUser & { must_change_password?: boolean }) | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return verifyAccessToken(header.slice(7));
}

export async function registerAuthHooks(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (req, reply) => {
    if (PUBLIC_PATHS.has(req.url.split('?')[0])) return;

    const bearer = bearerUser(req);
    if (bearer) {
      const row = db.prepare('SELECT * FROM users WHERE id = ? AND disabled = 0').get(bearer.id) as UserRow | undefined;
      if (row) req.authUser = publicUser(row);
      else return reply.code(401).send({ error: '登录已失效' });
      return;
    }

    // 迁移期兼容旧 TEAM_TOKEN；后续移除。
    if (config.teamToken && req.headers['x-team-token'] === config.teamToken) {
      const row = db.prepare("SELECT * FROM users WHERE id = 'u_spl' AND disabled = 0").get() as UserRow | undefined;
      if (row) {
        req.authUser = publicUser(row);
        return;
      }
    }

    // 本地模式保留：回环请求可直接落到首个/种子账号，云端必须显式登录。
    if (!config.auth.required && LOOPBACK.has(req.ip)) {
      const row = db.prepare('SELECT * FROM users WHERE disabled = 0 ORDER BY created_at LIMIT 1').get() as UserRow | undefined;
      if (row) {
        req.authUser = publicUser(row);
        return;
      }
    }

    return reply.code(401).send({ error: '请先登录' });
  });
}
