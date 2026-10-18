import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

export interface AuthUser {
  id: string;
  username: string;
  email: string | null;
  role: 'owner' | 'admin' | 'member';
}

interface AccessPayload {
  sub: string;
  username: string;
  role: AuthUser['role'];
  exp: number;
}

const b64url = (value: Buffer | string) => Buffer.from(value).toString('base64url');
const fromB64url = (value: string) => Buffer.from(value, 'base64url');

function secret(): Buffer {
  return Buffer.from(config.auth.secret || 'dev-only-remainder-secret');
}

function sign(data: string): string {
  return createHmac('sha256', secret()).update(data).digest('base64url');
}

export function issueAccessToken(user: AuthUser, ttlSeconds = 15 * 60): string {
  const payload: AccessPayload = {
    sub: user.id,
    username: user.username,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function verifyAccessToken(token: string): AuthUser | null {
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(fromB64url(body).toString('utf8')) as AccessPayload;
    if (payload.exp * 1000 <= Date.now()) return null;
    return { id: payload.sub, username: payload.username, email: null, role: payload.role };
  } catch {
    return null;
  }
}

export function newRefreshToken(): { token: string; hash: string; expiresAt: string } {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 30 * 86400_000).toISOString();
  return { token, hash: sha256(token), expiresAt };
}

export function refreshTokenHash(token: string): string {
  return sha256(token);
}

function sha256(value: string): string {
  return createHmac('sha256', secret()).update(value).digest('hex');
}
