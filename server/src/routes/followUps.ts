import type { FastifyInstance } from 'fastify';
import { db } from '../db/connection.js';
import { now } from './helpers.js';

export default async function followUpRoutes(app: FastifyInstance) {
  // 一键再催：次数+1，记录催办时间
  app.post('/api/follow-ups/:taskId/urge', async (req, reply) => {
    const { taskId } = req.params as { taskId: string };
    const r = db.prepare(
      'UPDATE follow_ups SET urge_count = urge_count + 1, last_urged_at = ? WHERE task_id = ?',
    ).run(now(), taskId);
    if (r.changes === 0) return reply.code(404).send({ error: '跟进记录不存在' });
    return db.prepare('SELECT * FROM follow_ups WHERE task_id = ?').get(taskId);
  });

  // 更新被催人 / 下次跟进日期
  app.patch('/api/follow-ups/:taskId', async (req, reply) => {
    const { taskId } = req.params as { taskId: string };
    const b = (req.body ?? {}) as { person?: string; nextFollowDate?: string };
    const exist = db.prepare('SELECT task_id FROM follow_ups WHERE task_id = ?').get(taskId);
    if (!exist) return reply.code(404).send({ error: '跟进记录不存在' });
    if (b.person !== undefined)
      db.prepare('UPDATE follow_ups SET person = ? WHERE task_id = ?').run(b.person, taskId);
    if (b.nextFollowDate !== undefined)
      db.prepare('UPDATE follow_ups SET next_follow_date = ? WHERE task_id = ?').run(b.nextFollowDate, taskId);
    return db.prepare('SELECT * FROM follow_ups WHERE task_id = ?').get(taskId);
  });
}
