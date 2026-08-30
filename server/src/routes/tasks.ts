import type { FastifyInstance } from 'fastify';
import { db } from '../db/connection.js';
import { now, uuid } from './helpers.js';
import { getTodayView } from '../services/today.js';

// 子任务/想法可编辑字段（type 由项目继承或固定为 idea，不可直接改）
const TASK_FIELDS = ['title', 'status', 'priority', 'ddl', 'tags', 'note'] as const;

interface TaskBody {
  title?: string;
  type?: 'idea';
  status?: string;
  priority?: number;
  ddl?: string | null;
  tags?: string;
  note?: string;
  projectId?: string | null;
}

function getTask(id: string) {
  return db.prepare(
    `SELECT t.*, p.name AS project_name
     FROM tasks t LEFT JOIN projects p ON p.id = t.project_id WHERE t.id = ?`,
  ).get(id);
}

export default async function taskRoutes(app: FastifyInstance) {
  // 列表：?projectId=&type=&status=&date=YYYY-MM-DD；默认排除 archived；带 project_name
  app.get('/api/tasks', async (req) => {
    const { projectId, type, status, date } = req.query as Record<string, string | undefined>;
    const conds: string[] = [];
    const params: unknown[] = [];
    if (projectId) { conds.push('t.project_id = ?'); params.push(projectId); }
    if (type) { conds.push('t.type = ?'); params.push(type); }
    if (status) { conds.push('t.status = ?'); params.push(status); }
    else { conds.push("t.status != 'archived'"); }
    if (date) { conds.push('substr(t.ddl, 1, 10) = ?'); params.push(date); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    return db.prepare(
      `SELECT t.*, p.name AS project_name
       FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
       ${where} ORDER BY t.priority, t.ddl IS NULL, t.ddl`,
    ).all(...params);
  });

  // 今日视图（桌面小组件用）：逾期 / 今日到期 / 今日待跟进（统一走 services/today）
  app.get('/api/tasks/today', async () => getTodayView());

  // 新建：传 projectId → 子任务（type 从项目继承）；不传且 type='idea' → 平铺想法
  app.post('/api/tasks', async (req, reply) => {
    const b = (req.body ?? {}) as TaskBody;
    if (!b.title?.trim()) return reply.code(400).send({ error: 'title 必填' });

    let type = 'idea';
    let projectId: string | null = null;
    if (b.projectId) {
      const project = db.prepare('SELECT id, type FROM projects WHERE id = ?').get(b.projectId) as
        | { id: string; type: string }
        | undefined;
      if (!project) return reply.code(404).send({ error: '所属项目不存在' });
      type = project.type; // 子任务类型从项目继承
      projectId = project.id;
    } else if (b.type !== 'idea') {
      return reply.code(400).send({ error: "不传 projectId 时 type 必须是 'idea'；main/side/follow 请走 /api/projects" });
    }

    const id = uuid();
    const ts = now();
    db.prepare(
      `INSERT INTO tasks (id,title,type,status,priority,ddl,tags,note,created_at,updated_at,project_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(id, b.title.trim(), type, 'todo', b.priority ?? 2, b.ddl ?? null,
      b.tags ?? '', b.note ?? '', ts, ts, projectId);
    return reply.code(201).send(getTask(id));
  });

  // 更新
  app.patch('/api/tasks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const exist = db.prepare('SELECT id FROM tasks WHERE id = ?').get(id);
    if (!exist) return reply.code(404).send({ error: '任务不存在' });
    const b = (req.body ?? {}) as TaskBody;
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const f of TASK_FIELDS) {
      if (b[f as keyof TaskBody] !== undefined) { sets.push(`${f} = ?`); params.push(b[f as keyof TaskBody]); }
    }
    // 状态切换联动 done_at：完成时补时间戳，reopen 时清空
    if (b.status !== undefined) {
      if (b.status === 'done') { sets.push('done_at = COALESCE(done_at, ?)'); params.push(now()); }
      else { sets.push('done_at = NULL'); }
    }
    if (sets.length) {
      sets.push('updated_at = ?'); params.push(now(), id);
      db.prepare(`UPDATE tasks SET ${sets.join(',')} WHERE id = ?`).run(...params);
    }
    return getTask(id);
  });

  // 完成
  app.post('/api/tasks/:id/done', async (req, reply) => {
    const { id } = req.params as { id: string };
    const r = db.prepare("UPDATE tasks SET status='done', done_at=?, updated_at=? WHERE id=?")
      .run(now(), now(), id);
    if (r.changes === 0) return reply.code(404).send({ error: '任务不存在' });
    return getTask(id);
  });

  // 删除
  app.delete('/api/tasks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const r = db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    if (r.changes === 0) return reply.code(404).send({ error: '任务不存在' });
    return { deleted: id };
  });
}
