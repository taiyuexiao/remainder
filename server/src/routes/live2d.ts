import type { FastifyInstance } from 'fastify';
import { createReadStream, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { openPath } from '../services/openPath.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// 模型根目录：server/data/live2d-models/<模型名>/xxx.model3.json
export const LIVE2D_MODEL_ROOT = join(__dirname, '..', '..', 'data', 'live2d-models');
mkdirSync(LIVE2D_MODEL_ROOT, { recursive: true });

const MIME_BY_EXT: Record<string, string> = {
  '.json': 'application/json; charset=utf-8',
  '.moc': 'application/octet-stream',
  '.moc3': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mtn': 'application/octet-stream',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

export default async function live2dRoutes(app: FastifyInstance) {
  // 模型列表：扫描子目录，优先 Cubism3+（*.model3.json），兼容 Cubism2（model.json / *.model.json）
  app.get('/api/live2d/models', async () => {
    const base = `http://127.0.0.1:${config.port}`;
    const models: { name: string; url: string; format: 'cubism4' | 'cubism2' }[] = [];
    for (const dir of readdirSync(LIVE2D_MODEL_ROOT)) {
      const dirPath = join(LIVE2D_MODEL_ROOT, dir);
      if (!statSync(dirPath).isDirectory()) continue;
      const files = readdirSync(dirPath);
      const v4 = files.find((f) => f.endsWith('.model3.json'));
      const v2 = files.find((f) => f === 'model.json' || f.endsWith('.model.json'));
      const entry = v4 ?? v2;
      if (!entry) continue;
      models.push({
        name: dir,
        url: `${base}/api/live2d/files/${encodeURIComponent(dir)}/${encodeURIComponent(entry)}`,
        format: v4 ? 'cubism4' : 'cubism2',
      });
    }
    return { models, root: LIVE2D_MODEL_ROOT };
  });

  // 模型文件下发（支持嵌套路径，如 shizuku/shizuku.1024/texture_00.png）
  app.get('/api/live2d/files/:dir/*', async (req, reply) => {
    const { dir } = req.params as { dir: string };
    const rel = (req.params as Record<string, string>)['*'] ?? '';
    const path = normalize(join(LIVE2D_MODEL_ROOT, dir, rel));
    if (!path.startsWith(LIVE2D_MODEL_ROOT + sep))
      return reply.code(400).send({ error: '非法路径' });
    if (!existsSync(path) || !statSync(path).isFile())
      return reply.code(404).send({ error: '文件不存在' });
    reply.header('Content-Type', MIME_BY_EXT[extname(path).toLowerCase()] ?? 'application/octet-stream');
    reply.header('Cache-Control', 'public, max-age=3600');
    return reply.send(createReadStream(path));
  });

  // 打开模型文件夹（方便用户放模型包）
  app.post('/api/live2d/open-folder', async () => {
    mkdirSync(LIVE2D_MODEL_ROOT, { recursive: true });
    openPath(LIVE2D_MODEL_ROOT);
    return { ok: true, root: LIVE2D_MODEL_ROOT };
  });
}
