import type { FastifyInstance } from 'fastify';
import { db } from '../db/connection.js';
import { localDate, now, uuid } from './helpers.js';
import { generateWeeklyReport } from '../llm/index.js';

const REPORT_COLS = 'id, type, date, title, content, created_at';

interface ReportBody {
  date?: string;
}

/** 本日任务概览 */
function getDailyTasks() {
  const today = localDate();
  return {
    date: today,
    overdue: db.prepare(
      `SELECT id, title, type, status, priority, ddl, done_at FROM tasks
       WHERE status IN ('todo','doing') AND ddl IS NOT NULL AND substr(ddl,1,10) < ? ORDER BY ddl ASC`,
    ).all(today),
    today: db.prepare(
      `SELECT id, title, type, status, priority, ddl, done_at FROM tasks
       WHERE (substr(ddl,1,10) = ? OR done_at LIKE ? || '%') ORDER BY created_at DESC`,
    ).all(today, today),
    followUps: db.prepare(
      `SELECT p.id, p.name AS title, p.status, f.person, f.next_follow_date, f.urge_count
       FROM projects p JOIN follow_ups f ON f.task_id = p.id
       WHERE p.type='follow' AND p.status IN ('todo','doing') AND substr(f.next_follow_date,1,10) <= ?`,
    ).all(today),
  };
}

/** 本周任务概览 */
function getWeeklyTasks() {
  const start = weekStartDate();
  const startIso = start.toISOString();
  const today = localDate();
  return {
    date: `${localDate(start)} ~ ${today}`,
    doneProjects: db.prepare(
      "SELECT id, name, type, done_at FROM projects WHERE status='done' AND done_at >= ? ORDER BY done_at DESC",
    ).all(startIso),
    doneTasks: db.prepare(
      `SELECT t.id, t.title, p.name AS project_name, t.done_at FROM tasks t
       LEFT JOIN projects p ON p.id = t.project_id
       WHERE t.status='done' AND t.done_at >= ? ORDER BY t.done_at DESC`,
    ).all(startIso),
    doingProjects: db.prepare(
      `SELECT p.id, p.name, p.type,
         (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status='done') AS done_count,
         (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS total_count
       FROM projects p WHERE p.status IN ('todo','doing') ORDER BY p.updated_at DESC`,
    ).all(),
    overdueTasks: db.prepare(
      `SELECT t.id, t.title, p.name AS project_name, t.ddl FROM tasks t
       LEFT JOIN projects p ON p.id = t.project_id
       WHERE t.status IN ('todo','doing') AND t.ddl IS NOT NULL AND substr(t.ddl,1,10) < ? ORDER BY t.ddl ASC`,
    ).all(today),
  };
}

/** 本月任务概览 */
function getMonthlyTasks() {
  const nowD = new Date();
  const start = new Date(nowD.getFullYear(), nowD.getMonth(), 1);
  const startIso = start.toISOString();
  const today = localDate();
  return {
    date: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01 ~ ${today}`,
    doneProjects: db.prepare(
      "SELECT id, name, type, done_at FROM projects WHERE status='done' AND done_at >= ? ORDER BY done_at DESC",
    ).all(startIso),
    doneTasks: db.prepare(
      `SELECT t.id, t.title, p.name AS project_name, t.done_at FROM tasks t
       LEFT JOIN projects p ON p.id = t.project_id
       WHERE t.status='done' AND t.done_at >= ? ORDER BY t.done_at DESC`,
    ).all(startIso),
    doingProjects: db.prepare(
      `SELECT p.id, p.name, p.type,
         (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status='done') AS done_count,
         (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS total_count
       FROM projects p WHERE p.status IN ('todo','doing') ORDER BY p.updated_at DESC`,
    ).all(),
    overdueTasks: db.prepare(
      `SELECT t.id, t.title, p.name AS project_name, t.ddl FROM tasks t
       LEFT JOIN projects p ON p.id = t.project_id
       WHERE t.status IN ('todo','doing') AND t.ddl IS NOT NULL AND substr(t.ddl,1,10) < ? ORDER BY t.ddl ASC`,
    ).all(today),
  };
}

function weekStartDate(): Date {
  const d = new Date();
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** 无 LLM 时的模板降级日报 */
function buildDailyFallback(data: ReturnType<typeof getDailyTasks>): string {
  const lines = [`## 今日完成`];
  const done = data.today.filter((t: any) => t.status === 'done');
  if (!done.length) lines.push('- 无');
  done.forEach((t: any) => lines.push(`- ${t.title}`));
  lines.push('', '## 今日待办');
  const todo = data.today.filter((t: any) => t.status !== 'done');
  if (!todo.length) lines.push('- 无');
  todo.forEach((t: any) => lines.push(`- ${t.title}`));
  if (data.overdue.length) {
    lines.push('', '## 逾期提醒');
    data.overdue.forEach((t: any) => lines.push(`- ${t.title}（ddl ${t.ddl?.slice(0, 10)}）`));
  }
  if (data.followUps.length) {
    lines.push('', '## 今日跟进');
    data.followUps.forEach((t: any) => lines.push(`- ${t.title}：@${t.person ?? ''}，已催 ${t.urge_count ?? 0} 次`));
  }
  return lines.join('\n');
}

/** 无 LLM 时的模板降级周报 */
function buildWeeklyFallback(data: ReturnType<typeof getWeeklyTasks>): string {
  const lines = [`## 本周完成`];
  if (!data.doneProjects.length && !data.doneTasks.length) lines.push('- 无');
  data.doneProjects.forEach((p: any) => lines.push(`- 完成项目：${p.name}`));
  data.doneTasks.forEach((t: any) => lines.push(`- ${t.title}${t.project_name ? `（${t.project_name}）` : ''}`));
  lines.push('', '## 进行中');
  if (!data.doingProjects.length) lines.push('- 无');
  data.doingProjects.forEach((p: any) => lines.push(`- ${p.name}（${p.done_count}/${p.total_count}）`));
  if (data.overdueTasks.length) {
    lines.push('', '## 风险与逾期');
    data.overdueTasks.forEach((t: any) => lines.push(`- ${t.title}（ddl ${t.ddl?.slice(0, 10)}）`));
  }
  return lines.join('\n');
}

/** 无 LLM 时的模板降级月报 */
function buildMonthlyFallback(data: ReturnType<typeof getMonthlyTasks>): string {
  const lines = [`## 本月完成`];
  if (!data.doneProjects.length && !data.doneTasks.length) lines.push('- 无');
  data.doneProjects.forEach((p: any) => lines.push(`- 完成项目：${p.name}`));
  data.doneTasks.forEach((t: any) => lines.push(`- ${t.title}${t.project_name ? `（${t.project_name}）` : ''}`));
  lines.push('', '## 进行中项目');
  if (!data.doingProjects.length) lines.push('- 无');
  data.doingProjects.forEach((p: any) => lines.push(`- ${p.name}（${p.done_count}/${p.total_count}）`));
  if (data.overdueTasks.length) {
    lines.push('', '## 逾期风险');
    data.overdueTasks.forEach((t: any) => lines.push(`- ${t.title}（ddl ${t.ddl?.slice(0, 10)}）`));
  }
  return lines.join('\n');
}

export default async function reportRoutes(app: FastifyInstance) {
  // 任务概览
  app.get('/api/reports/tasks/:range', async (req, reply) => {
    const { range } = req.params as { range: string };
    if (range === 'today') return getDailyTasks();
    if (range === 'week') return getWeeklyTasks();
    if (range === 'month') return getMonthlyTasks();
    return reply.code(400).send({ error: 'range 必须是 today/week/month' });
  });

  // 历史报告列表
  app.get('/api/reports', async (req) => {
    const { type } = req.query as { type?: string };
    if (type) {
      return db.prepare(`SELECT ${REPORT_COLS} FROM reports WHERE type = ? ORDER BY date DESC, created_at DESC`).all(type);
    }
    return db.prepare(`SELECT ${REPORT_COLS} FROM reports ORDER BY date DESC, created_at DESC`).all();
  });

  // 单条报告
  app.get('/api/reports/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const report = db.prepare(`SELECT ${REPORT_COLS} FROM reports WHERE id = ?`).get(id);
    if (!report) return reply.code(404).send({ error: '报告不存在' });
    return report;
  });

  // 生成日报
  app.post('/api/reports/daily', async (req) => {
    const b = (req.body ?? {}) as ReportBody;
    const date = b.date ?? localDate();
    const data = getDailyTasks();
    let md = buildDailyFallback(data);
    try {
      // 日报暂时用 fallback，后期可接 LLM
    } catch {
      // ignore
    }
    const id = uuid();
    const ts = now();
    db.prepare(
      `INSERT INTO reports (id,type,date,title,content,created_at) VALUES (?,?,?,?,?,?)`,
    ).run(id, 'daily', date, `日报 ${date}`, md, ts);
    return db.prepare(`SELECT ${REPORT_COLS} FROM reports WHERE id = ?`).get(id);
  });

  // 生成周报
  app.post('/api/reports/weekly', async (req) => {
    const b = (req.body ?? {}) as ReportBody;
    const date = b.date ?? localDate();
    const data = getWeeklyTasks();
    let md = buildWeeklyFallback(data);
    try {
      const llmResult = await generateWeeklyReport({
        weekStart: data.date.split(' ~ ')[0],
        weekEnd: data.date.split(' ~ ')[1],
        doneProjects: data.doneProjects.map((p: any) => ({ name: p.name, type: p.type })),
        doneTasks: data.doneTasks.map((t: any) => ({ title: t.title, project_name: t.project_name })),
        doingProjects: data.doingProjects.map((p: any) => ({ name: p.name, type: p.type, done_count: p.done_count, total_count: p.total_count })),
        doingTasks: [],
        overdueTasks: data.overdueTasks.map((t: any) => ({ title: t.title, project_name: t.project_name, ddl: t.ddl })),
        followUps: [],
      });
      if (llmResult) md = llmResult;
    } catch {
      // fallback already set
    }
    const id = uuid();
    const ts = now();
    db.prepare(
      `INSERT INTO reports (id,type,date,title,content,created_at) VALUES (?,?,?,?,?,?)`,
    ).run(id, 'weekly', date, `周报 ${date}`, md, ts);
    return db.prepare(`SELECT ${REPORT_COLS} FROM reports WHERE id = ?`).get(id);
  });

  // 生成月报
  app.post('/api/reports/monthly', async (req) => {
    const b = (req.body ?? {}) as ReportBody;
    const date = b.date ?? localDate();
    const data = getMonthlyTasks();
    const md = buildMonthlyFallback(data);
    const id = uuid();
    const ts = now();
    db.prepare(
      `INSERT INTO reports (id,type,date,title,content,created_at) VALUES (?,?,?,?,?,?)`,
    ).run(id, 'monthly', date, `月报 ${date}`, md, ts);
    return db.prepare(`SELECT ${REPORT_COLS} FROM reports WHERE id = ?`).get(id);
  });

  // 删除报告
  app.delete('/api/reports/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const r = db.prepare('DELETE FROM reports WHERE id = ?').run(id);
    if (r.changes === 0) return reply.code(404).send({ error: '报告不存在' });
    return { deleted: id };
  });
}
