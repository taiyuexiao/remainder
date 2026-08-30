import type { FastifyInstance } from 'fastify';
import { db } from '../db/connection.js';
import { now, uuid } from './helpers.js';
import { rebuildDocsFts, searchDocs, stripToText } from '../services/docSearch.js';

interface DocumentBody {
  title?: string;
  content?: string;
  tags?: string;
  source_url?: string;
  summary?: string;
  folderId?: string | null;
}

const LIST_COLS = 'id, title, content, tags, source_url, summary, clip_id, folder_id, created_at, updated_at';

const emptyDocContent = JSON.stringify({
  type: 'doc',
  content: [{ type: 'paragraph' }],
});

export default async function documentRoutes(app: FastifyInstance) {
  // 全文搜索（M11.4）：?q=；>=3 字走 FTS5 trigram，<3 字 LIKE 兜底
  app.get('/api/documents/search', async (req) => {
    const { q } = req.query as { q?: string };
    return searchDocs(q ?? '');
  });

  // 列表：按更新时间倒序；支持 folderId 筛选
  app.get('/api/documents', async (req) => {
    const { folderId } = req.query as { folderId?: string };
    if (folderId) {
      return db.prepare(`SELECT ${LIST_COLS} FROM documents WHERE folder_id = ? ORDER BY updated_at DESC`).all(folderId);
    }
    return db.prepare(`SELECT ${LIST_COLS} FROM documents ORDER BY updated_at DESC`).all();
  });

  // 单篇
  app.get('/api/documents/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const doc = db.prepare(`SELECT ${LIST_COLS} FROM documents WHERE id = ?`).get(id);
    if (!doc) return reply.code(404).send({ error: '文档不存在' });
    return doc;
  });

  // 新建
  app.post('/api/documents', async (req, reply) => {
    const b = (req.body ?? {}) as DocumentBody;
    if (!b.title?.trim()) return reply.code(400).send({ error: 'title 必填' });
    const id = uuid();
    const ts = now();
    const content = b.content ?? emptyDocContent;
    const folderId = b.folderId ?? 'default';
    if (folderId !== 'default') {
      const folder = db.prepare('SELECT id FROM doc_folders WHERE id = ?').get(folderId);
      if (!folder) return reply.code(400).send({ error: 'folderId 不存在' });
    }
    db.prepare(
      `INSERT INTO documents (id,title,content,content_text,tags,source_url,summary,folder_id,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run(id, b.title.trim(), content, stripToText(content),
      b.tags ?? '', b.source_url ?? '', b.summary ?? '', folderId, ts, ts);
    rebuildDocsFts();
    return reply.code(201).send(db.prepare(`SELECT ${LIST_COLS} FROM documents WHERE id = ?`).get(id));
  });

  // 更新（title/content/tags/source_url/summary；content 变更时同步 content_text）
  app.patch('/api/documents/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const exist = db.prepare('SELECT id FROM documents WHERE id = ?').get(id);
    if (!exist) return reply.code(404).send({ error: '文档不存在' });
    const b = (req.body ?? {}) as DocumentBody;
    const sets: string[] = [];
    const params: unknown[] = [];
    if (b.title !== undefined) { sets.push('title = ?'); params.push(b.title.trim()); }
    if (b.content !== undefined) {
      sets.push('content = ?', 'content_text = ?');
      params.push(b.content, stripToText(b.content));
    }
    if (b.tags !== undefined) { sets.push('tags = ?'); params.push(b.tags); }
    if (b.source_url !== undefined) { sets.push('source_url = ?'); params.push(b.source_url); }
    if (b.summary !== undefined) { sets.push('summary = ?'); params.push(b.summary); }
    if (b.folderId !== undefined) {
      if (b.folderId !== null && b.folderId !== 'default') {
        const folder = db.prepare('SELECT id FROM doc_folders WHERE id = ?').get(b.folderId);
        if (!folder) return reply.code(400).send({ error: 'folderId 不存在' });
      }
      sets.push('folder_id = ?'); params.push(b.folderId ?? null);
    }
    if (sets.length) {
      sets.push('updated_at = ?'); params.push(now(), id);
      db.prepare(`UPDATE documents SET ${sets.join(',')} WHERE id = ?`).run(...params);
      rebuildDocsFts();
    }
    return db.prepare(`SELECT ${LIST_COLS} FROM documents WHERE id = ?`).get(id);
  });

  // 删除
  app.delete('/api/documents/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const r = db.prepare('DELETE FROM documents WHERE id = ?').run(id);
    if (r.changes === 0) return reply.code(404).send({ error: '文档不存在' });
    rebuildDocsFts();
    return { deleted: id };
  });
}
