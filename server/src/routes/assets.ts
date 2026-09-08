import type { FastifyInstance } from 'fastify';
import { createReadStream, existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../db/connection.js';

/**
 * 个性化资源（M30 P1 背景系统）：背景图上传/读取/删除。
 * 文件存 server/data/assets/，settings 表 bg_image 记当前文件名；图片本身大，不入库。
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '..', '..', 'data', 'assets');
mkdirSync(ASSETS_DIR, { recursive: true });

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif',
};

function currentBg(): string | null {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('bg_image') as { value?: string } | undefined;
    return row?.value || null;
  } catch {
    return null;
  }
}

export default async function assetRoutes(app: FastifyInstance) {
  // 上传背景图（multipart，≤30MB 走全局限制）
  app.post('/api/assets/background', async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: '缺少文件' });
    const ext = extname(file.filename ?? '').toLowerCase();
    if (!MIME_BY_EXT[ext]) return reply.code(400).send({ error: '仅支持 png/jpg/webp/gif' });
    const buf = await file.toBuffer();
    const name = `bg-${Date.now()}${ext}`;
    // 清旧背景图
    const old = currentBg();
    if (old && existsSync(join(ASSETS_DIR, old))) unlinkSync(join(ASSETS_DIR, old));
    writeFileSync(join(ASSETS_DIR, name), buf);
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run('bg_image', name);
    return reply.code(201).send({ file: name });
  });

  // 读当前背景图
  app.get('/api/assets/background', async (req, reply) => {
    const name = currentBg();
    if (!name) return reply.code(404).send({ error: '未设置背景图' });
    const path = normalize(join(ASSETS_DIR, name));
    if (!path.startsWith(ASSETS_DIR + sep) || !existsSync(path)) return reply.code(404).send({ error: '文件不存在' });
    reply.header('Content-Type', MIME_BY_EXT[extname(path).toLowerCase()] ?? 'application/octet-stream');
    reply.header('Cache-Control', 'no-cache');
    return reply.send(createReadStream(path));
  });

  // 删除背景图
  app.delete('/api/assets/background', async () => {
    const old = currentBg();
    if (old && existsSync(join(ASSETS_DIR, old))) unlinkSync(join(ASSETS_DIR, old));
    db.prepare("DELETE FROM settings WHERE key = 'bg_image'").run();
    return { deleted: old };
  });
}
