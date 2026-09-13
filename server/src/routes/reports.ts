import type { FastifyInstance } from 'fastify';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { db } from '../db/connection.js';
import { localDate, now, uuid } from './helpers.js';
import { generateWeeklyReport } from '../llm/index.js';
import { mdToTiptapJson } from '../services/markdown.js';

const REPORT_COLS = 'id, type, date, title, content, created_at, updated_at';

interface ReportBody {
  type?: 'daily' | 'weekly' | 'monthly' | 'thinking';
  date?: string;
  title?: string;
  content?: string;
  /** Markdown 原文（M35：standup-agent 推送/AI 生成），服务端转 Tiptap JSON 存库 */
  content_markdown?: string;
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

/** Markdown → Tiptap JSON 转换器已提取到 services/markdown.ts（M35，供 standup-agent 集成复用） */

/** 预填日报内容 */
function buildDailyContent(data: ReturnType<typeof getDailyTasks>): string {
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

/** 预填周报内容 */
function buildWeeklyContent(data: ReturnType<typeof getWeeklyTasks>): string {
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
  lines.push('', '## 下周计划', '- （待补充）');
  return lines.join('\n');
}

/** 预填月报内容 */
function buildMonthlyContent(data: ReturnType<typeof getMonthlyTasks>): string {
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
  lines.push('', '## 下月计划', '- （待补充）');
  return lines.join('\n');
}

/** 创建报告（同一类型同一日期已存在则返回已有）。reports 路由与 agent 工具共用（M34 / A3）
 *  thinking 为日记板块（M22）：不做任务预填，给空文档 */
export async function createReport(type: 'daily' | 'weekly' | 'monthly' | 'thinking', date: string) {
  const existing = db.prepare(`SELECT ${REPORT_COLS} FROM reports WHERE type = ? AND date = ?`).get(type, date) as
    | Record<string, unknown>
    | undefined;
  if (existing) return { row: existing, created: false };

  let md: string;
  let title: string;
  if (type === 'thinking') {
    md = '';
    title = `日记 ${date}`;
  } else if (type === 'daily') {
    md = buildDailyContent(getDailyTasks());
    title = `日报 ${date}`;
  } else if (type === 'weekly') {
    const data = getWeeklyTasks();
    md = buildWeeklyContent(data);
    title = `周报 ${date}`;
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
  } else {
    md = buildMonthlyContent(getMonthlyTasks());
    title = `月报 ${date}`;
  }

  const id = uuid();
  const ts = now();
  db.prepare(
    `INSERT INTO reports (id,type,date,title,content,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`,
  ).run(id, type, date, title, mdToTiptapJson(md), ts, ts);
  return { row: db.prepare(`SELECT ${REPORT_COLS} FROM reports WHERE id = ?`).get(id) as Record<string, unknown>, created: true };
}

/* ---------- standup-agent（highagent）集成，M35 ---------- */

type StandupType = 'daily' | 'weekly' | 'monthly';

/** ISO 周标签 YYYY-Www（周一为起点），与 highagent week_label 一致 */
function isoWeekLabel(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // 本周周四
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const fDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fDay + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** 周一日期 YYYY-MM-DD，与前端 getCurrentDateForType('weekly') 一致 */
function mondayOf(d: Date): string {
  const m = new Date(d);
  m.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localDate(m);
}

/** highagent 输出目录：读 ~/.config/highagent/config.toml 的 output_dir，缺省 ~/daily-reports */
function highagentOutputDir(): string {
  try {
    const toml = readFileSync(join(homedir(), '.config', 'highagent', 'config.toml'), 'utf8');
    const m = toml.match(/^\s*output_dir\s*=\s*["'](.+?)["']/m);
    if (m) return m[1].replace(/^~(?=$|\/)/, homedir());
  } catch {
    // 无配置用默认
  }
  return join(homedir(), 'daily-reports');
}

/** 按序找 highagent 可执行文件：~/.local/bin/highagent → PATH */
function findHighagent(): string | null {
  const local = join(homedir(), '.local', 'bin', 'highagent');
  if (existsSync(local)) return local;
  const which = spawnSync('which', ['highagent'], { encoding: 'utf8' });
  const p = which.stdout?.trim().split('\n')[0];
  return which.status === 0 && p ? p : null;
}

const STANDUP_TIMEOUT_MS = 10 * 60 * 1000;

/** 执行 highagent 子命令，等完成；超时杀进程。返回 exit code / stderr 摘要 */
function runHighagent(bin: string, args: string[]): Promise<{ code: number | null; timedOut: boolean; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, STANDUP_TIMEOUT_MS);
    child.stderr.on('data', (c) => {
      stderr += c.toString();
      if (stderr.length > 4000) stderr = stderr.slice(-4000);
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, timedOut, stderr: stderr.trim() });
    });
  });
}

/** standup 日期换算（与 ReportsPage getCurrentDateForType 对齐）：
 *  daily → 当天；weekly → 任意一天换算出周一存库 + ISO 周标签定位文件；monthly → YYYY-MM */
function standupTarget(type: StandupType, dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  if (type === 'daily') {
    const date = localDate(d);
    return { reportDate: date, title: `AI 日报 ${date}`, args: ['report', '--date', date], file: `${date}.md` };
  }
  if (type === 'weekly') {
    const label = isoWeekLabel(d);
    return {
      reportDate: mondayOf(d),
      title: `AI 周报 ${label}`,
      args: ['weekly', '--date', localDate(d)],
      file: `weekly-${label}.md`,
    };
  }
  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return { reportDate: ym, title: `AI 月报 ${ym}`, args: ['monthly', '--date', localDate(d)], file: `monthly-${ym}.md` };
}

/** 把 markdown 写入已有报告（content_markdown 共用逻辑） */
function writeReportMarkdown(id: string, md: string, title?: string) {
  const sets = ['content = ?', 'updated_at = ?'];
  const params: unknown[] = [mdToTiptapJson(md), now()];
  if (title !== undefined) {
    sets.push('title = ?');
    params.push(title);
  }
  params.push(id);
  db.prepare(`UPDATE reports SET ${sets.join(', ')} WHERE id = ?`).run(...params);
}

/* ---------- standup-agent 集成结束 ---------- */

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

  // 按类型+日期查找
  app.get('/api/reports/by-date', async (req, reply) => {
    const { type, date } = req.query as { type?: string; date?: string };
    if (!type || !date) return reply.code(400).send({ error: 'type 和 date 必填' });
    const report = db.prepare(`SELECT ${REPORT_COLS} FROM reports WHERE type = ? AND date = ?`).get(type, date);
    if (!report) return reply.code(404).send({ error: '报告不存在' });
    return report;
  });

  // 单条报告
  app.get('/api/reports/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const report = db.prepare(`SELECT ${REPORT_COLS} FROM reports WHERE id = ?`).get(id);
    if (!report) return reply.code(404).send({ error: '报告不存在' });
    return report;
  });

  // 创建报告（同一类型同一日期已存在则返回已有；M35：可带 title/content/content_markdown 直接写入）
  app.post('/api/reports', async (req, reply) => {
    const b = (req.body ?? {}) as ReportBody;
    if (!b.type || !b.date) return reply.code(400).send({ error: 'type 和 date 必填' });
    const { row, created } = await createReport(b.type, b.date);
    if (b.content_markdown !== undefined) {
      writeReportMarkdown(row.id as string, b.content_markdown, b.title);
    } else if (b.title !== undefined || b.content !== undefined) {
      const sets: string[] = [];
      const params: unknown[] = [];
      if (b.title !== undefined) { sets.push('title = ?'); params.push(b.title.trim()); }
      if (b.content !== undefined) { sets.push('content = ?'); params.push(b.content); }
      sets.push('updated_at = ?'); params.push(now(), row.id as string);
      db.prepare(`UPDATE reports SET ${sets.join(',')} WHERE id = ?`).run(...params);
    }
    const fresh = db.prepare(`SELECT ${REPORT_COLS} FROM reports WHERE id = ?`).get(row.id as string);
    return reply.code(created ? 201 : 200).send(fresh);
  });

  // AI 生成报告（M35）：调本机 standup-agent（highagent）生成日/周/月报并导入
  app.post('/api/reports/standup', async (req, reply) => {
    const b = (req.body ?? {}) as { type?: StandupType; date?: string };
    if (!b.type || !['daily', 'weekly', 'monthly'].includes(b.type)) {
      return reply.code(400).send({ error: 'type 必须是 daily/weekly/monthly' });
    }
    const dateStr = b.date ?? localDate();
    const target = standupTarget(b.type, dateStr);
    if (!target) return reply.code(400).send({ error: 'date 格式非法（YYYY-MM-DD）' });

    const bin = findHighagent();
    if (!bin) {
      return reply
        .code(502)
        .send({ error: '未找到 highagent 可执行文件，请先安装 standup-agent（~/.local/bin/highagent 或加入 PATH）' });
    }

    let run: { code: number | null; timedOut: boolean; stderr: string };
    try {
      run = await runHighagent(bin, target.args);
    } catch (e) {
      return reply.code(502).send({ error: `highagent 启动失败：${(e as Error).message}` });
    }
    if (run.timedOut) {
      return reply.code(502).send({ error: 'highagent 执行超时（10 分钟），已终止' });
    }

    // 已存在跳过时 highagent 仍 exit 0，属成功；非 0 时若产物文件已在（如 monthly 子命令尚未实现但文件已推送），仍导入
    const filePath = join(highagentOutputDir(), target.file);
    if (run.code !== 0) {
      if (!existsSync(filePath)) {
        const tail = run.stderr ? `：${run.stderr.slice(-500)}` : '';
        return reply.code(502).send({ error: `highagent 执行失败（exit ${run.code}）${tail}` });
      }
    } else if (!existsSync(filePath)) {
      return reply.code(502).send({ error: `highagent 执行成功但未找到产物文件 ${filePath}` });
    }

    let md: string;
    try {
      md = readFileSync(filePath, 'utf8');
    } catch (e) {
      return reply.code(502).send({ error: `读取报告文件失败：${(e as Error).message}` });
    }

    const { row } = await createReport(b.type, target.reportDate);
    writeReportMarkdown(row.id as string, md, target.title);
    return db.prepare(`SELECT ${REPORT_COLS} FROM reports WHERE id = ?`).get(row.id as string);
  });

  // 更新报告
  app.patch('/api/reports/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const exist = db.prepare('SELECT id FROM reports WHERE id = ?').get(id);
    if (!exist) return reply.code(404).send({ error: '报告不存在' });
    const b = (req.body ?? {}) as ReportBody;
    if (b.content_markdown !== undefined) {
      writeReportMarkdown(id, b.content_markdown, b.title);
      return db.prepare(`SELECT ${REPORT_COLS} FROM reports WHERE id = ?`).get(id);
    }
    const sets: string[] = [];
    const params: unknown[] = [];
    if (b.title !== undefined) { sets.push('title = ?'); params.push(b.title.trim()); }
    if (b.content !== undefined) { sets.push('content = ?'); params.push(b.content); }
    if (sets.length) {
      sets.push('updated_at = ?'); params.push(now(), id);
      db.prepare(`UPDATE reports SET ${sets.join(',')} WHERE id = ?`).run(...params);
    }
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
