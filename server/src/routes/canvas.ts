import type { FastifyInstance } from 'fastify';
import { db } from '../db/connection.js';
import { now, uuid } from './helpers.js';

const BOARD_COLS = 'id, title, created_at, updated_at';
const ITEM_COLS = 'id, board_id, type, x, y, w, h, content, source_url, created_at, updated_at';

interface BoardBody {
  title?: string;
}

interface ItemBody {
  type?: 'text' | 'image' | 'clip';
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  content?: string;
  sourceUrl?: string;
}

export default async function canvasRoutes(app: FastifyInstance) {
  // 画布列表
  app.get('/api/canvas-boards', async () =>
    db.prepare(`SELECT ${BOARD_COLS} FROM canvas_boards ORDER BY updated_at DESC`).all());

  // 新建画布
  app.post('/api/canvas-boards', async (req, reply) => {
    const b = (req.body ?? {}) as BoardBody;
    if (!b.title?.trim()) return reply.code(400).send({ error: 'title 必填' });
    const id = uuid();
    const ts = now();
    db.prepare(`INSERT INTO canvas_boards (id,title,created_at,updated_at) VALUES (?,?,?,?)`)
      .run(id, b.title.trim(), ts, ts);
    return reply.code(201).send(db.prepare(`SELECT ${BOARD_COLS} FROM canvas_boards WHERE id = ?`).get(id));
  });

  // 画布详情 + 所有卡片
  app.get('/api/canvas-boards/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const board = db.prepare(`SELECT ${BOARD_COLS} FROM canvas_boards WHERE id = ?`).get(id);
    if (!board) return reply.code(404).send({ error: '画布不存在' });
    const items = db.prepare(`SELECT ${ITEM_COLS} FROM canvas_items WHERE board_id = ? ORDER BY created_at ASC`).all(id);
    return { ...board as object, items };
  });

  // 更新画布
  app.patch('/api/canvas-boards/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const exist = db.prepare('SELECT id FROM canvas_boards WHERE id = ?').get(id);
    if (!exist) return reply.code(404).send({ error: '画布不存在' });
    const b = (req.body ?? {}) as BoardBody;
    if (b.title !== undefined) {
      db.prepare('UPDATE canvas_boards SET title = ?, updated_at = ? WHERE id = ?')
        .run(b.title.trim(), now(), id);
    }
    return db.prepare(`SELECT ${BOARD_COLS} FROM canvas_boards WHERE id = ?`).get(id);
  });

  // 删除画布
  app.delete('/api/canvas-boards/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const r = db.prepare('DELETE FROM canvas_boards WHERE id = ?').run(id);
    if (r.changes === 0) return reply.code(404).send({ error: '画布不存在' });
    return { deleted: id };
  });

  // 新增卡片
  app.post('/api/canvas-boards/:id/items', async (req, reply) => {
    const { id } = req.params as { id: string };
    const board = db.prepare('SELECT id FROM canvas_boards WHERE id = ?').get(id);
    if (!board) return reply.code(404).send({ error: '画布不存在' });
    const b = (req.body ?? {}) as ItemBody;
    const itemId = uuid();
    const ts = now();
    db.prepare(
      `INSERT INTO canvas_items (id,board_id,type,x,y,w,h,content,source_url,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      itemId,
      id,
      b.type ?? 'text',
      b.x ?? 100,
      b.y ?? 100,
      b.w ?? 240,
      b.h ?? 160,
      b.content ?? '',
      b.sourceUrl ?? '',
      ts,
      ts,
    );
    return reply.code(201).send(db.prepare(`SELECT ${ITEM_COLS} FROM canvas_items WHERE id = ?`).get(itemId));
  });

  // 更新卡片
  app.patch('/api/canvas-items/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const exist = db.prepare('SELECT id FROM canvas_items WHERE id = ?').get(id);
    if (!exist) return reply.code(404).send({ error: '卡片不存在' });
    const b = (req.body ?? {}) as ItemBody;
    const sets: string[] = [];
    const params: unknown[] = [];
    if (b.x !== undefined) { sets.push('x = ?'); params.push(b.x); }
    if (b.y !== undefined) { sets.push('y = ?'); params.push(b.y); }
    if (b.w !== undefined) { sets.push('w = ?'); params.push(b.w); }
    if (b.h !== undefined) { sets.push('h = ?'); params.push(b.h); }
    if (b.content !== undefined) { sets.push('content = ?'); params.push(b.content); }
    if (b.sourceUrl !== undefined) { sets.push('source_url = ?'); params.push(b.sourceUrl); }
    if (sets.length) {
      sets.push('updated_at = ?'); params.push(now(), id);
      db.prepare(`UPDATE canvas_items SET ${sets.join(',')} WHERE id = ?`).run(...params);
    }
    return db.prepare(`SELECT ${ITEM_COLS} FROM canvas_items WHERE id = ?`).get(id);
  });

  // 删除卡片
  app.delete('/api/canvas-items/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const r = db.prepare('DELETE FROM canvas_items WHERE id = ?').run(id);
    if (r.changes === 0) return reply.code(404).send({ error: '卡片不存在' });
    return { deleted: id };
  });
}
