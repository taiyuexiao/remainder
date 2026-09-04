import type { FastifyInstance } from 'fastify';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { db } from '../db/connection.js';
import { now, uuid } from './helpers.js';
import { rebuildDocsFts, searchDocs, stripToText } from '../services/docSearch.js';
import { openPath } from '../services/openPath.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// 文档导出目录：server/data/exports/
const EXPORT_DIR = join(__dirname, '..', '..', 'data', 'exports');

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

  // 列表：按更新时间倒序；支持 folderId 筛选（folderId='root' 或空表示根级）
  app.get('/api/documents', async (req) => {
    const { folderId } = req.query as { folderId?: string };
    if (folderId === 'root') {
      return db.prepare(`SELECT ${LIST_COLS} FROM documents WHERE folder_id IS NULL ORDER BY updated_at DESC`).all();
    }
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
    const folderId = b.folderId ?? null;
    if (folderId) {
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
      if (b.folderId) {
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

  // 导入本地文件（M19）：md/txt 直读；docx 走 mammoth→HTML；pdf 走 pdf-parse→纯文本
  app.post('/api/documents/import', async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: '缺少文件' });
    const name = file.filename || '未命名';
    const ext = name.toLowerCase().split('.').pop() ?? '';
    const title = name.replace(/\.[^.]+$/, '');
    const buf = await file.toBuffer();

    let content: string;
    if (ext === 'md' || ext === 'markdown' || ext === 'txt') {
      content = buf.toString('utf8');
    } else if (ext === 'docx') {
      const { value } = await mammoth.convertToHtml({ buffer: buf });
      content = value;
    } else if (ext === 'pdf') {
      const parser = new PDFParse({ data: new Uint8Array(buf) });
      const data = await parser.getText();
      await parser.destroy();
      content = data.text;
    } else {
      return reply.code(400).send({ error: '仅支持 md / txt / docx / pdf' });
    }
    if (!content.trim()) return reply.code(400).send({ error: '文件内容为空或解析失败' });

    const id = uuid();
    const ts = now();
    db.prepare(
      `INSERT INTO documents (id,title,content,content_text,tags,source_url,summary,folder_id,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,NULL,?,?)`,
    ).run(id, title, content, stripToText(content), '', '本地导入', '', ts, ts);
    rebuildDocsFts();
    return reply.code(201).send(db.prepare(`SELECT ${LIST_COLS} FROM documents WHERE id = ?`).get(id));
  });

  // 导出到本地 Markdown（server/data/exports/），并打开导出目录
  app.post('/api/documents/:id/export', async (req, reply) => {
    const { id } = req.params as { id: string };
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as
      | { title: string; content: string; content_text: string | null; source_url: string; tags: string; created_at: string }
      | undefined;
    if (!doc) return reply.code(404).send({ error: '文档不存在' });
    mkdirSync(EXPORT_DIR, { recursive: true });
    const safe = (doc.title || '未命名').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
    let file = join(EXPORT_DIR, `${safe}.md`);
    for (let n = 2; existsSync(file); n++) file = join(EXPORT_DIR, `${safe}-${n}.md`);
    const text = doc.content_text ?? stripToText(doc.content);
    const md = [
      `# ${doc.title}`,
      '',
      doc.source_url ? `> 来源：${doc.source_url}` : '',
      doc.tags ? `> 标签：${doc.tags}` : '',
      `> 创建：${doc.created_at} ｜ 导出：${now()}`,
      '',
      text,
      '',
    ].filter((l) => l !== '').join('\n');
    writeFileSync(file, md, 'utf8');
    openPath(EXPORT_DIR);
    return { path: file };
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
