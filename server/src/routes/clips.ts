import type { FastifyInstance } from 'fastify';
import { createReadStream, existsSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { db } from '../db/connection.js';
import { now, uuid } from './helpers.js';
import { CLIP_IMAGE_DIR, processClip } from '../services/clipPipeline.js';
import { config } from '../config.js';
import { rebuildDocsFts, stripToText } from '../services/docSearch.js';

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
};

interface ClipBody {
  html?: string;
  url?: string;
  title?: string;
  source?: 'extension' | 'clipboard';
}

export default async function clipRoutes(app: FastifyInstance) {
  // 剪藏入库：原始 HTML → 解析管线（提取/清洗/图片本地化）→ 剪藏箱
  app.post('/api/clips', async (req, reply) => {
    const b = (req.body ?? {}) as ClipBody;
    if (!b.html?.trim()) return reply.code(400).send({ error: 'html 必填' });
    const source = b.source === 'clipboard' ? 'clipboard' : 'extension';

    const { title, contentHtml, excerpt, imageStats } = await processClip({
      html: b.html,
      url: b.url,
      title: b.title,
    });

    const id = uuid();
    db.prepare(
      `INSERT INTO clips (id,url,title,content_html,excerpt,source,status,created_at)
       VALUES (?,?,?,?,?,?, 'inbox', ?)`,
    ).run(id, b.url ?? '', title, contentHtml, excerpt, source, now());
    req.log.info({ id, imageStats }, 'clip stored');
    return reply.code(201).send({
      ...(db.prepare('SELECT * FROM clips WHERE id = ?').get(id) as object),
      imageStats,
    });
  });

  // 剪藏箱列表：inbox 优先，按时间倒序
  app.get('/api/clips', async () =>
    db.prepare(
      `SELECT id,url,title,excerpt,source,status,converted_doc_id,created_at
       FROM clips ORDER BY status = 'converted', created_at DESC`,
    ).all(),
  );

  // 单条详情（含正文，预览用）
  app.get('/api/clips/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const clip = db.prepare('SELECT * FROM clips WHERE id = ?').get(id);
    if (!clip) return reply.code(404).send({ error: '剪藏不存在' });
    return clip;
  });

  app.delete('/api/clips/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const r = db.prepare('DELETE FROM clips WHERE id = ?').run(id);
    if (r.changes === 0) return reply.code(404).send({ error: '剪藏不存在' });
    return { deleted: id };
  });

  // 一键转知识库文档
  app.post('/api/clips/:id/convert', async (req, reply) => {
    const { id } = req.params as { id: string };
    const clip = db.prepare('SELECT * FROM clips WHERE id = ?').get(id) as
      | { id: string; title: string; content_html: string; excerpt: string; url: string; status: string; converted_doc_id: string | null }
      | undefined;
    if (!clip) return reply.code(404).send({ error: '剪藏不存在' });
    if (clip.status === 'converted')
      return reply.code(409).send({ error: '已转换过', docId: clip.converted_doc_id });

    const b = (req.body ?? {}) as { title?: string };
    const docId = uuid();
    const ts = now();
    // 图片相对路径转绝对（文档会在 Tauri webview(tauri.localhost)/浏览器里打开，相对路径会 404）
    const contentHtml = clip.content_html.replaceAll(
      'src="/api/clips/images/',
      `src="http://127.0.0.1:${config.port}/api/clips/images/`,
    );
    // 知识库元数据（M11.4）：来源链接/摘要/clip 关联 + 搜索用纯文本
    db.prepare(
      `INSERT INTO documents (id,title,content,content_text,source_url,summary,clip_id,folder_id,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run(docId, (b.title ?? clip.title).trim() || clip.title, contentHtml,
      stripToText(contentHtml), clip.url, clip.excerpt, clip.id, 'default', ts, ts);
    db.prepare("UPDATE clips SET status='converted', converted_doc_id=? WHERE id=?").run(docId, id);
    rebuildDocsFts();
    return reply.code(201).send(
      db.prepare('SELECT id,title,content,tags,source_url,summary,clip_id,folder_id,created_at,updated_at FROM documents WHERE id = ?').get(docId),
    );
  });

  // 本地化图片服务（防路径穿越：只取 basename）
  app.get('/api/clips/images/:file', async (req, reply) => {
    const { file } = req.params as { file: string };
    const safe = basename(file);
    if (safe !== file || safe.includes('..'))
      return reply.code(400).send({ error: '非法文件名' });
    const path = join(CLIP_IMAGE_DIR, safe);
    if (!existsSync(path)) return reply.code(404).send({ error: '图片不存在' });
    reply.header('Content-Type', MIME_BY_EXT[extname(safe).toLowerCase()] ?? 'application/octet-stream');
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    return reply.send(createReadStream(path));
  });
}
