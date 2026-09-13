import type { FastifyInstance } from 'fastify';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../db/connection.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', 'data');

let syncing = false;

function git(args: string[], timeout = 60_000): string {
  return execFileSync('git', args, { cwd: DATA_DIR, encoding: 'utf8', timeout }).trim();
}

/** a 是否为 b 的祖先（merge-base --is-ancestor 退出码 0 表示是） */
function isAncestor(a: string, b: string): boolean {
  try {
    git(['merge-base', '--is-ancestor', a, b]);
    return true;
  } catch {
    return false;
  }
}

// 远端有新数据时必须换掉 remainder.db，而运行中的服务持有旧连接；
// 做法：派生一个脱离父进程的守候脚本，等本进程退出后 reset --hard 并原样拉起服务。
// 用 CJS 模板写进系统临时目录，避免给 data 目录引入会被同步的杂物文件。
const RESTART_HELPER = `
const { execSync, spawn } = require('node:child_process');
const [pid, dataDir, entry, cwd] = process.argv.slice(2);
const deadline = Date.now() + 60000;
function alive() {
  try { process.kill(Number(pid), 0); return true; } catch { return false; }
}
const timer = setInterval(() => {
  if (Date.now() > deadline) { clearInterval(timer); process.exit(1); }
  if (alive()) return;
  clearInterval(timer);
  setTimeout(() => {
    try {
      execSync('git fetch origin', { cwd: dataDir, stdio: 'ignore', timeout: 90000 });
      execSync('git reset --hard origin/main', { cwd: dataDir, stdio: 'ignore' });
    } catch {}
    const child = spawn(process.execPath, [entry], { cwd, detached: true, stdio: 'ignore' });
    child.unref();
    process.exit(0);
  }, 600);
}, 400);
`;

function restartWithRemoteData() {
  const helperPath = join(tmpdir(), 'remainder-sync-restart.cjs');
  writeFileSync(helperPath, RESTART_HELPER);
  const child = spawn(
    process.execPath,
    [helperPath, String(process.pid), DATA_DIR, process.argv[1], process.cwd()],
    { detached: true, stdio: 'ignore' },
  );
  child.unref();
  // 给响应留出返回时间再退出
  setTimeout(() => process.exit(0), 800);
}

export default async function syncRoutes(app: FastifyInstance) {
  // 一键双端同步（M21）：checkpoint + 本地提交 + fetch；
  // 本地领先则直接 push 返回；远端领先/分叉则备份后重启服务应用远端数据
  app.post('/api/sync', async (_req, reply) => {
    if (!existsSync(join(DATA_DIR, '.git'))) {
      return reply.code(400).send({
        error: '未绑定同步仓库：请退出应用后在便携包根目录执行 data-sync.mjs pull <仓库地址>',
      });
    }
    if (syncing) return reply.code(409).send({ error: '同步进行中，请稍候' });
    syncing = true;
    try {
      // 1) WAL 落盘 + 提交本地改动
      db.pragma('wal_checkpoint(TRUNCATE)');
      git(['add', '-A']);
      let committed = false;
      try {
        git(['diff', '--cached', '--quiet']);
      } catch {
        git(['commit', '-m', `sync ${new Date().toISOString()}`]);
        committed = true;
      }

      // 2) 拉远端引用
      try {
        git(['fetch', 'origin'], 90_000);
      } catch {
        return reply.code(502).send({ error: '网络异常：拉取远端失败。本地改动已提交，稍后重试即可' });
      }

      const local = git(['rev-parse', 'HEAD']);
      let remote = '';
      try {
        remote = git(['rev-parse', 'origin/main']);
      } catch {
        /* 远端还没有 main 分支：视为首次推送 */
      }

      // 3) 快进场景：远端无新内容，本地领先直接 push，无需重启
      if (!remote || local === remote || (isAncestor(remote, local) && !isAncestor(local, remote))) {
        if (local !== remote) {
          try {
            git(['push', '-u', 'origin', 'main'], 90_000);
          } catch {
            return reply.code(502).send({ error: '网络异常：推送失败。本地改动已提交，稍后重试即可' });
          }
          return { status: 'pushed', committed };
        }
        return { status: 'uptodate', committed };
      }

      // 4) 远端领先或分叉：需要应用远端数据
      //    分叉时先把本地 HEAD 备份推送到远端分支，再整体切到远端（last-write-wins，数据不丢）
      let backup: string | null = null;
      if (!isAncestor(local, remote)) {
        backup = `backup-${Date.now()}`;
        try {
          git(['push', 'origin', `HEAD:refs/heads/${backup}`], 90_000);
        } catch {
          backup = null;
        }
      }
      restartWithRemoteData();
      return { status: 'restarting', backup };
    } finally {
      syncing = false;
    }
  });
}
