import type { FastifyInstance } from 'fastify';
import { db } from '../db/connection.js';
import { now, uuid } from './helpers.js';

const PROJECT_FIELDS = ['name', 'status', 'priority', 'ddl', 'milestone', 'tags', 'note'] as const;

interface ProjectBody {
  name?: string;
  type?: 'main' | 'side' | 'follow';
  status?: string;
  priority?: number;
  ddl?: string | null;
  milestone?: string;
  tags?: string;
  note?: string;
  // follow 型项目附加字段（写 follow_ups 表）
  person?: string;
  nextFollowDate?: string;
}

/** 项目行 + 子任务进度 + follow 字段 */
function getProject(id: string) {
  return db.prepare(
    `SELECT p.*, f.person, f.next_follow_date, f.urge_count, f.last_urged_at,
       (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') AS done_count,
       (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS total_count
     FROM projects p LEFT JOIN follow_ups f ON f.task_id = p.id
     WHERE p.id = ?`,
  ).get(id);
}

export default async function projectRoutes(app: FastifyInstance) {
  // 列表：?type=&status=；默认排除 archived
  app.get('/api/projects', async (req) => {
    const { type, status } = req.query as Record<string, string | undefined>;
    const conds: string[] = [];
    const params: unknown[] = [];
    if (type) { conds.push('p.type = ?'); params.push(type); }
    if (status) { conds.push('p.status = ?'); params.push(status); }
    else { conds.push("p.status != 'archived'"); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    return db.prepare(
      `SELECT p.*, f.person, f.next_follow_date, f.urge_count, f.last_urged_at,
         (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') AS done_count,
         (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS total_count
       FROM projects p LEFT JOIN follow_ups f ON f.task_id = p.id
       ${where} ORDER BY p.priority, p.ddl IS NULL, p.ddl`,
    ).all(...params);
  });

  // 新建项目（follow 型必填 person + nextFollowDate）
  app.post('/api/projects', async (req, reply) => {
    const b = (req.body ?? {}) as ProjectBody;
    if (!b.name?.trim()) return reply.code(400).send({ error: 'name 必填' });
    if (!b.type || !['main', 'side', 'follow'].includes(b.type))
      return reply.code(400).send({ error: "type 必须是 main|side|follow" });
    if (b.type === 'follow' && (!b.person?.trim() || !b.nextFollowDate))
      return reply.code(400).send({ error: 'follow 型项目必须提供 person 和 nextFollowDate' });

    const id = uuid();
    const ts = now();
    db.prepare(
      `INSERT INTO projects (id,name,type,status,priority,ddl,milestone,tags,note,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(id, b.name.trim(), b.type, 'todo', b.priority ?? 2, b.ddl ?? null,
      b.milestone ?? '', b.tags ?? '', b.note ?? '', ts, ts);
    if (b.type === 'follow') {
      db.prepare('INSERT INTO follow_ups (task_id,person,next_follow_date) VALUES (?,?,?)')
        .run(id, b.person!.trim(), b.nextFollowDate!);
    }
    return reply.code(201).send(getProject(id));
  });

  // 更新（含 follow 字段 upsert）
  app.patch('/api/projects/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const exist = db.prepare('SELECT id FROM projects WHERE id = ?').get(id);
    if (!exist) return reply.code(404).send({ error: '项目不存在' });
    const b = (req.body ?? {}) as ProjectBody;
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const f of PROJECT_FIELDS) {
      if (b[f as keyof ProjectBody] !== undefined) { sets.push(`${f} = ?`); params.push(b[f as keyof ProjectBody]); }
    }
    // 状态切换联动 done_at：完成时补时间戳， reopen 时清空
    if (b.status !== undefined) {
      if (b.status === 'done') { sets.push('done_at = COALESCE(done_at, ?)'); params.push(now()); }
      else { sets.push('done_at = NULL'); }
    }
    if (sets.length) {
      sets.push('updated_at = ?'); params.push(now(), id);
      db.prepare(`UPDATE projects SET ${sets.join(',')} WHERE id = ?`).run(...params);
    }
    if (b.person !== undefined || b.nextFollowDate !== undefined) {
      // 先读现有行合并，避免只传一个字段时 INSERT 侧 NOT NULL 约束失败
      const cur = db.prepare('SELECT person, next_follow_date FROM follow_ups WHERE task_id = ?').get(id) as
        | { person: string; next_follow_date: string }
        | undefined;
      const person = b.person ?? cur?.person;
      const nextFollowDate = b.nextFollowDate ?? cur?.next_follow_date;
      if (!person?.trim() || !nextFollowDate)
        return reply.code(400).send({ error: 'follow 字段需要同时有 person 和 nextFollowDate' });
      db.prepare(
        `INSERT INTO follow_ups (task_id,person,next_follow_date) VALUES (?,?,?)
         ON CONFLICT(task_id) DO UPDATE SET
           person = excluded.person,
           next_follow_date = excluded.next_follow_date`,
      ).run(id, person, nextFollowDate);
    }
    return getProject(id);
  });

  // 完成项目（无子任务的项目行本身也可直接勾选完成）
  app.post('/api/projects/:id/done', async (req, reply) => {
    const { id } = req.params as { id: string };
    const r = db.prepare("UPDATE projects SET status='done', done_at=?, updated_at=? WHERE id=?")
      .run(now(), now(), id);
    if (r.changes === 0) return reply.code(404).send({ error: '项目不存在' });
    return getProject(id);
  });

  // 删除项目：不删子任务——子任务 project_id 置空、type 置 'idea'（落入想法区，不丢数据）
  app.delete('/api/projects/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const tx = db.transaction(() => {
      db.prepare("UPDATE tasks SET project_id = NULL, type = 'idea', updated_at = ? WHERE project_id = ?")
        .run(now(), id);
      return db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    });
    const r = tx();
    if (r.changes === 0) return reply.code(404).send({ error: '项目不存在' });
    return { deleted: id };
  });
}
