import type { FastifyInstance } from 'fastify';
import { openPath } from '../services/openPath.js';

export default async function systemRoutes(app: FastifyInstance) {
  // 用系统默认浏览器打开外部链接（Tauri webview 内 window.open 不可靠）
  app.post('/api/open-external', async (req, reply) => {
    const b = (req.body ?? {}) as { url?: string };
    const url = b.url?.trim() ?? '';
    if (!/^https?:\/\//i.test(url)) return reply.code(400).send({ error: '仅支持 http(s) 链接' });
    openPath(url);
    return { ok: true };
  });
}
