import type { FastifyInstance } from 'fastify';
import { db } from '../db/connection.js';
import { now, uuid } from './helpers.js';

interface ConvertBody {
  type?: 'main' | 'side' | 'follow' | 'idea';
  title?: string;
  ddl?: string | null;
  priority?: number;
  projectId?: string;      // 传 → 转为该项目的子任务
  person?: string;
  nextFollowDate?: string;
}

export default async function inboxRoutes(app: FastifyInstance) {
  app.get('/api/inbox', async () =>
    db.prepare('SELECT * FROM inbox WHERE converted_task_id IS NULL ORDER BY created_at DESC').all());

  app.post('/api/inbox', async (req, reply) => {
    const b = (req.body ?? {}) as { content?: string; tags?: string };
    if (!b.content?.trim()) return reply.code(400).send({ error: 'content 必填' });
    const id = uuid();
    db.prepare('INSERT INTO inbox (id,content,tags,created_at) VALUES (?,?,?,?)')
      .run(id, b.content.trim(), b.tags ?? '', now());
    return reply.code(201).send(db.prepare('SELECT * FROM inbox WHERE id = ?').get(id));
  });

  app.delete('/api/inbox/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const r = db.prepare('DELETE FROM inbox WHERE id = ?').run(id);
    if (r.changes === 0) return reply.code(404).send({ error: '条目不存在' });
    return { deleted: id };
  });

  // 编辑速记（M22）：内容/标签
  app.patch('/api/inbox/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const exist = db.prepare('SELECT id FROM inbox WHERE id = ?').get(id);
    if (!exist) return reply.code(404).send({ error: '条目不存在' });
    const b = (req.body ?? {}) as { content?: string; tags?: string };
    const sets: string[] = [];
    const params: unknown[] = [];
    if (b.content !== undefined) {
      if (!b.content.trim()) return reply.code(400).send({ error: 'content 不能为空' });
      sets.push('content = ?');
      params.push(b.content.trim());
    }
    if (b.tags !== undefined) {
      sets.push('tags = ?');
      params.push(b.tags.trim());
    }
    if (sets.length) {
      params.push(id);
      db.prepare(`UPDATE inbox SET ${sets.join(',')} WHERE id = ?`).run(...params);
    }
    return db.prepare('SELECT * FROM inbox WHERE id = ?').get(id);
  });

  // 一键转任务
  app.post('/api/inbox/:id/convert', async (req, reply) => {
    const { id } = req.params as { id: string };
    const item = db.prepare('SELECT * FROM inbox WHERE id = ?').get(id) as
      | { id: string; content: string; tags: string; converted_task_id: string | null }
      | undefined;
    if (!item) return reply.code(404).send({ error: '条目不存在' });
    if (item.converted_task_id) return reply.code(409).send({ error: '已转换过' });

    const b = (req.body ?? {}) as ConvertBody;
    const ts = now();
    const title = (b.title ?? item.content).trim();

    // 传入 projectId：转为该项目的子任务（type 从项目继承）
    if (b.projectId) {
      const project = db.prepare('SELECT id, type FROM projects WHERE id = ?').get(b.projectId) as
        | { id: string; type: string }
        | undefined;
      if (!project) return reply.code(404).send({ error: '所属项目不存在' });
      const taskId = uuid();
      db.prepare(
        `INSERT INTO tasks (id,title,type,status,priority,ddl,tags,note,created_at,updated_at,project_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(taskId, title, project.type, 'todo', b.priority ?? 2,
        b.ddl ?? null, item.tags, `来源: Inbox 速记`, ts, ts, project.id);
      db.prepare('UPDATE inbox SET converted_task_id = ? WHERE id = ?').run(taskId, id);
      return reply.code(201).send(db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId));
    }

    const type = b.type ?? 'side';
    // idea：平铺想法任务（不项目化）
    if (type === 'idea') {
      const taskId = uuid();
      db.prepare(
        `INSERT INTO tasks (id,title,type,status,priority,ddl,tags,note,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      ).run(taskId, title, 'idea', 'todo', b.priority ?? 2,
        b.ddl ?? null, item.tags, `来源: Inbox 速记`, ts, ts);
      db.prepare('UPDATE inbox SET converted_task_id = ? WHERE id = ?').run(taskId, id);
      return reply.code(201).send(db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId));
    }

    // main/side/follow：新建项目
    if (type === 'follow' && (!b.person?.trim() || !b.nextFollowDate))
      return reply.code(400).send({ error: '转 follow 型必须提供 person 和 nextFollowDate' });
    const projectId = uuid();
    db.prepare(
      `INSERT INTO projects (id,name,type,status,priority,ddl,tags,note,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run(projectId, title, type, 'todo', b.priority ?? 2,
      b.ddl ?? null, item.tags, `来源: Inbox 速记`, ts, ts);
    if (type === 'follow') {
      db.prepare('INSERT INTO follow_ups (task_id,person,next_follow_date) VALUES (?,?,?)')
        .run(projectId, b.person!.trim(), b.nextFollowDate!);
    }
    db.prepare('UPDATE inbox SET converted_task_id = ? WHERE id = ?').run(projectId, id);
    return reply.code(201).send(db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId));
  });
}
