import { db } from '../db/connection.js';
import { config } from '../config.js';
import { hashPassword, verifyPassword } from './password.js';
import { newRefreshToken, refreshTokenHash, type AuthUser } from './tokens.js';
import { now, uuid } from '../routes/helpers.js';

export interface UserRow {
  id: string;
  username: string;
  email: string | null;
  password_hash: string;
  role: AuthUser['role'];
  must_change_password: number;
  disabled: number;
  created_at: string;
  updated_at: string;
}

export function publicUser(row: UserRow): AuthUser & { must_change_password: boolean } {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    role: row.role,
    must_change_password: row.must_change_password === 1,
  };
}

export async function ensureBootstrapUser(): Promise<void> {
  const username = config.auth.bootstrapUsername.trim();
  const password = config.auth.bootstrapPassword;
  if (!username || !password) return;
  const existing = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
  if (existing) {
    if (existing.password_hash === '!pending!') {
      db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
        .run(await hashPassword(password), now(), existing.id);
    }
    return;
  }
  const id = username === 'spl' ? 'u_spl' : `u_${uuid()}`;
  const ts = now();
  db.prepare(
    `INSERT INTO users (id,username,email,password_hash,role,must_change_password,disabled,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(id, username, null, await hashPassword(password), 'owner', 0, 0, ts, ts);
}

export async function authenticate(identifier: string, password: string): Promise<UserRow | null> {
  const row = db.prepare(
    'SELECT * FROM users WHERE disabled = 0 AND (username = ? OR email = ?)',
  ).get(identifier.trim(), identifier.trim()) as UserRow | undefined;
  if (!row) return null;
  return (await verifyPassword(row.password_hash, password)) ? row : null;
}

export function createSession(userId: string, userAgent: string): { token: string; expiresAt: string } {
  const refresh = newRefreshToken();
  db.prepare(
    `INSERT INTO auth_sessions (id,user_id,refresh_hash,expires_at,created_at,user_agent)
     VALUES (?,?,?,?,?,?)`,
  ).run(uuid(), userId, refresh.hash, refresh.expiresAt, now(), userAgent.slice(0, 300));
  return { token: refresh.token, expiresAt: refresh.expiresAt };
}

export function consumeRefreshToken(token: string): UserRow | null {
  const hash = refreshTokenHash(token);
  const session = db.prepare(
    `SELECT s.id AS session_id, s.user_id, s.expires_at, s.revoked_at, u.*
     FROM auth_sessions s JOIN users u ON u.id = s.user_id
     WHERE s.refresh_hash = ?`,
  ).get(hash) as (UserRow & { session_id: string; user_id: string; expires_at: string; revoked_at: string | null }) | undefined;
  if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) return null;
  db.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE id = ?').run(now(), session.session_id);
  return session;
}

export function revokeSession(token: string): void {
  db.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE refresh_hash = ? AND revoked_at IS NULL')
    .run(now(), refreshTokenHash(token));
}

export function userCount(): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
}

export function createInvite(createdBy: string): { code: string; expiresAt: string } {
  const code = `RM-${uuid().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
  const expiresAt = new Date(Date.now() + 7 * 86400_000).toISOString();
  db.prepare(
    'INSERT INTO invites (id,code_hash,created_by,expires_at,created_at) VALUES (?,?,?,?,?)',
  ).run(uuid(), refreshTokenHash(code), createdBy, expiresAt, now());
  return { code, expiresAt };
}

export function consumeInvite(code: string): boolean {
  const row = db.prepare(
    'SELECT * FROM invites WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?',
  ).get(refreshTokenHash(code), now()) as { id: string } | undefined;
  if (!row) return false;
  db.prepare('UPDATE invites SET used_at = ? WHERE id = ?').run(now(), row.id);
  return true;
}
