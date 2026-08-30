import type { FastifyInstance } from 'fastify';
import { db } from '../db/connection.js';
import { now, uuid } from './helpers.js';
import { rebuildDocsFts } from '../services/docSearch.js';
import { getDocTextForOrganize, previewAutoOrganize } from '../llm/index.js';

interface FolderBody {
  name?: string;
  parentId?: string | null;
  sortOrder?: number;
}

const FOLDER_COLS = 'id, name, parent_id, sort_order, created_at, updated_at';
const DOC_LIGHT_COLS = 'id, title, tags, source_url, summary, clip_id, folder_id, created_at, updated_at';

export default async function docFolderRoutes(app: FastifyInstance) {
  // 平铺列出所有文件夹（前端自己组装树）
  app.get('/api/doc-folders', async () =>
    db.prepare(`SELECT ${FOLDER_COLS} FROM doc_folders ORDER BY sort_order ASC, created_at ASC`).all());

  // 新建文件夹
  app.post('/api/doc-folders', async (req, reply) => {
    const b = (req.body ?? {}) as FolderBody;
    if (!b.name?.trim()) return reply.code(400).send({ error: 'name 必填' });
    if (b.parentId) {
      const parent = db.prepare('SELECT id FROM doc_folders WHERE id = ?').get(b.parentId);
      if (!parent) return reply.code(400).send({ error: 'parentId 不存在' });
    }
    const id = uuid();
    const ts = now();
    db.prepare(
      `INSERT INTO doc_folders (id,name,parent_id,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?)`,
    ).run(id, b.name.trim(), b.parentId ?? null, b.sortOrder ?? 0, ts, ts);
    return reply.code(201).send(db.prepare(`SELECT ${FOLDER_COLS} FROM doc_folders WHERE id = ?`).get(id));
  });

  // 更新文件夹（重命名 / 移动父级）
  app.patch('/api/doc-folders/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const exist = db.prepare('SELECT id FROM doc_folders WHERE id = ?').get(id);
    if (!exist) return reply.code(404).send({ error: '文件夹不存在' });
    const b = (req.body ?? {}) as FolderBody;

    if (b.parentId !== undefined) {
      if (b.parentId === id) return reply.code(400).send({ error: '不能把自己设为自己的父级' });
      if (b.parentId) {
        const parent = db.prepare('SELECT id FROM doc_folders WHERE id = ?').get(b.parentId);
        if (!parent) return reply.code(400).send({ error: 'parentId 不存在' });
        // 防环：不允许移动到子树之下
        const descendantIds = collectDescendantIds(id);
        if (descendantIds.includes(b.parentId)) {
          return reply.code(400).send({ error: '不能移动到子文件夹下' });
        }
      }
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    if (b.name !== undefined) { sets.push('name = ?'); params.push(b.name.trim()); }
    if (b.parentId !== undefined) { sets.push('parent_id = ?'); params.push(b.parentId ?? null); }
    if (b.sortOrder !== undefined) { sets.push('sort_order = ?'); params.push(b.sortOrder); }
    if (sets.length) {
      sets.push('updated_at = ?'); params.push(now(), id);
      db.prepare(`UPDATE doc_folders SET ${sets.join(',')} WHERE id = ?`).run(...params);
    }
    return db.prepare(`SELECT ${FOLDER_COLS} FROM doc_folders WHERE id = ?`).get(id);
  });

  // 删除文件夹：子文件夹和文档移入父级（根级则移到根级）
  app.delete('/api/doc-folders/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const folder = db.prepare('SELECT id, parent_id FROM doc_folders WHERE id = ?').get(id) as
      | { id: string; parent_id: string | null }
      | undefined;
    if (!folder) return reply.code(404).send({ error: '文件夹不存在' });

    const parentId = folder.parent_id;
    const descendantIds = collectDescendantIds(id);
    const allIds = [id, ...descendantIds];
    const placeholders = allIds.map(() => '?').join(',');

    // 文档移到父级（或根级）
    db.prepare(`UPDATE documents SET folder_id = ? WHERE folder_id IN (${placeholders})`).run(parentId, ...allIds);
    // 子文件夹移到父级（或根级）
    db.prepare(`UPDATE doc_folders SET parent_id = ? WHERE parent_id IN (${placeholders})`).run(parentId, ...allIds);
    // 删除自身和后代文件夹
    db.prepare(`DELETE FROM doc_folders WHERE id IN (${placeholders})`).run(...allIds);

    rebuildDocsFts();
    return { deleted: id };
  });

  // 获取某个文件夹的内容：子文件夹 + 文档；id='root' 表示根级
  app.get('/api/doc-folders/:id/contents', async (req, reply) => {
    const { id } = req.params as { id: string };
    let folders: unknown[];
    let docs: unknown[];
    if (id === 'root') {
      folders = db
        .prepare(`SELECT ${FOLDER_COLS} FROM doc_folders WHERE parent_id IS NULL ORDER BY sort_order ASC, name ASC`)
        .all();
      docs = db
        .prepare(`SELECT ${DOC_LIGHT_COLS} FROM documents WHERE folder_id IS NULL ORDER BY updated_at DESC`)
        .all();
    } else {
      const folder = db.prepare('SELECT id FROM doc_folders WHERE id = ?').get(id);
      if (!folder) return reply.code(404).send({ error: '文件夹不存在' });
      folders = db
        .prepare(`SELECT ${FOLDER_COLS} FROM doc_folders WHERE parent_id = ? ORDER BY sort_order ASC, name ASC`)
        .all(id);
      docs = db
        .prepare(`SELECT ${DOC_LIGHT_COLS} FROM documents WHERE folder_id = ? ORDER BY updated_at DESC`)
        .all(id);
    }
    return { folders, docs };
  });

  // LLM 归档预览
  app.post('/api/doc-folders/auto-organize/preview', async (req, reply) => {
    const { folderId, onlyUnorganized } = (req.body ?? {}) as { folderId?: string | null; onlyUnorganized?: boolean };
    let where = '1=1';
    const params: unknown[] = [];
    if (folderId) {
      where = 'folder_id = ?';
      params.push(folderId);
    } else if (onlyUnorganized) {
      where = 'folder_id IS NULL';
    }
    const docs = db
      .prepare(`SELECT id, title, summary, content FROM documents WHERE ${where} ORDER BY updated_at DESC LIMIT 100`)
      .all(...params) as { id: string; title: string; summary: string; content: string }[];

    const existing = db.prepare('SELECT name FROM doc_folders').all() as { name: string }[];
    const suggestions = await previewAutoOrganize(
      docs.map((d) => ({
        id: d.id,
        title: d.title,
        summary: d.summary,
        text: getDocTextForOrganize(d.content),
      })),
      existing.map((f) => f.name),
    );
    if (suggestions === null) {
      return reply.code(503).send({ error: 'LLM 未配置或不可用' });
    }
    return { suggestions, docs: docs.map((d) => ({ id: d.id, title: d.title, summary: d.summary })) };
  });

  // 应用归档建议
  app.post('/api/doc-folders/auto-organize/apply', async (req, reply) => {
    const { suggestions } = (req.body ?? {}) as { suggestions?: { name: string; docIds: string[] }[] };
    if (!Array.isArray(suggestions)) return reply.code(400).send({ error: 'suggestions 必须是数组' });

    const tx = db.transaction(() => {
      for (const s of suggestions) {
        if (!s.name?.trim() || !Array.isArray(s.docIds) || s.docIds.length === 0) continue;
        let folderId: string =
          (db.prepare('SELECT id FROM doc_folders WHERE name = ? AND parent_id IS NULL').get(s.name.trim()) as
            | { id: string }
            | undefined)?.id ?? '';
        if (!folderId) {
          folderId = uuid();
          db.prepare(
            `INSERT INTO doc_folders (id,name,parent_id,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?)`,
          ).run(folderId, s.name.trim(), null, 0, now(), now());
        }
        const placeholders = s.docIds.map(() => '?').join(',');
        db.prepare(`UPDATE documents SET folder_id = ? WHERE id IN (${placeholders})`).run(folderId, ...s.docIds);
      }
      rebuildDocsFts();
    });
    tx();
    return { applied: true };
  });
}

function collectDescendantIds(parentId: string): string[] {
  const out: string[] = [];
  const direct = db.prepare('SELECT id FROM doc_folders WHERE parent_id = ?').all(parentId) as { id: string }[];
  for (const d of direct) {
    out.push(d.id);
    out.push(...collectDescendantIds(d.id));
  }
  return out;
}
