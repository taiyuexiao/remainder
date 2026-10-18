import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const port = Number(process.env.PORT ?? 3219);
const tempDir = mkdtempSync(join(tmpdir(), 'remainder-m36-'));
const dbPath = join(tempDir, 'remainder.db');
const password = 'verify-only-password-2026';
const child = spawn(process.execPath, ['dist/index.js'], {
  cwd: join(root, 'server'),
  env: {
    ...process.env,
    PORT: String(port),
    HOST: '127.0.0.1',
    REMAINDER_DB_PATH: dbPath,
    AUTH_REQUIRED: 'true',
    AUTH_SECRET: 'verify-only-secret',
    BOOTSTRAP_USERNAME: 'spl',
    BOOTSTRAP_PASSWORD: password,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let stderr = '';
child.stderr.on('data', (b) => { stderr += String(b); });

const api = async (path, init) => {
  const r = await fetch(`http://127.0.0.1:${port}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const assert = (ok, message) => {
  if (!ok) throw new Error(message);
  console.log(`PASS ${message}`);
};

try {
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try {
      const health = await api('/api/health');
      if (health.status === 200) { ready = true; break; }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert(ready, 'server starts with isolated DB');
  const denied = await api('/api/tasks');
  assert(denied.status === 401, 'protected API rejects anonymous request');

  const bad = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: 'spl', password: 'wrong-password' }),
  });
  assert(bad.status === 401, 'wrong password is rejected');

  const login = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: 'spl', password }),
  });
  assert(login.status === 200 && login.body.accessToken, 'bootstrap owner can login');
  const auth = { Authorization: `Bearer ${login.body.accessToken}` };
  const me = await api('/api/auth/me', { headers: auth });
  assert(me.status === 200 && me.body.username === 'spl' && me.body.role === 'owner', 'token resolves bootstrap owner');
  const protectedOk = await api('/api/tasks', { headers: auth });
  assert(protectedOk.status === 200, 'owner token accesses protected API');

  const refreshed = await api('/api/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken: login.body.refreshToken }),
  });
  assert(refreshed.status === 200 && refreshed.body.refreshToken !== login.body.refreshToken, 'refresh rotates refresh token');

  const oldRefresh = await api('/api/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken: login.body.refreshToken }),
  });
  assert(oldRefresh.status === 401, 'old refresh token is revoked after rotation');

  const register = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username: 'verify_user', password: 'verify-only-password-2026' }),
  });
  assert(register.status === 403, 'registration without invite is blocked after owner exists');

  const invite = await api('/api/auth/invites', { method: 'POST', headers: auth });
  assert(invite.status === 201 && invite.body.code, 'owner creates invite code');
  const invited = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      username: 'verify_user',
      password: 'verify-only-password-2026',
      inviteCode: invite.body.code,
    }),
  });
  assert(invited.status === 201, 'invited user can register');
  const memberLogin = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: 'verify_user', password: 'verify-only-password-2026' }),
  });
  assert(memberLogin.status === 200, 'invited user can login');

  const ownerModels = await api('/api/live2d/models', { headers: auth });
  const memberModels = await api('/api/live2d/models', {
    headers: { Authorization: `Bearer ${memberLogin.body.accessToken}` },
  });
  assert(ownerModels.status === 200 && ownerModels.body.models.length > 0, 'owner receives bundled Live2D models');
  assert(
    JSON.stringify(ownerModels.body.models.map((m) => m.name)) ===
      JSON.stringify(memberModels.body.models.map((m) => m.name)),
    'new registered user receives the same bundled Live2D models',
  );
  console.log('M36 AUTH VERIFY: ALL PASS');
} finally {
  child.kill('SIGTERM');
  rmSync(tempDir, { recursive: true, force: true });
  if (stderr.trim()) console.error(stderr.slice(-1200));
}
