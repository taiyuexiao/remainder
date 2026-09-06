import { randomUUID } from 'node:crypto';
import { db } from '../db/connection.js';
import { config } from '../config.js';
import { localDate, now, type TodayView } from '../routes/helpers.js';
import { getTodayView } from '../services/today.js';
import { sendDailyReport } from '../mailer.js';
import { generateDailySummary } from '../llm/index.js';

let reportSentDate = '';

/** 通知队列（桌面端/Tauri 待取走） */
const notifications: Array<{ id: string; taskId: string; title: string; fireAt: string }> = [];

export function checkReminders() {
  if (!config.notifyEnabled) return;
  const nowISO = now();
  const due = db.prepare(
    `SELECT id, title FROM tasks
     WHERE status IN ('todo','doing')
       AND ddl IS NOT NULL
       AND datetime(ddl) <= datetime(?)
       AND (reminded_at IS NULL OR datetime(reminded_at) < datetime(ddl))`,
  ).all(nowISO) as { id: string; title: string }[];

  for (const t of due) {
    notifications.push({ id: randomUUID(), taskId: t.id, title: t.title, fireAt: nowISO });
    db.prepare('UPDATE tasks SET reminded_at = ? WHERE id = ?').run(nowISO, t.id);
  }
  if (due.length) {
    console.log(`[scheduler] fired ${due.length} reminder(s)`);
  }
}

async function checkDailyReport() {
  const [hour, minute] = config.smtp.reportTime.split(':').map((n) => parseInt(n, 10));
  const d = new Date();
  if (d.getHours() !== hour || d.getMinutes() !== minute) return;
  const dateStr = localDate(d);
  if (reportSentDate === dateStr) return;
  if (!config.smtp.user || !config.smtp.reportTo) return;

  const today = getTodayView();
  // 今日知识库动态（M23）
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
  const knowledgeToday = db.prepare(
    `SELECT title, type FROM knowledge_items WHERE created_at >= ? ORDER BY created_at DESC`,
  ).all(dayStart) as { title: string; type: string }[];

  let summary = '';
  try {
    const s = await generateDailySummary(today);
    summary = s ?? '';
  } catch (e) {
    summary = `（LLM 总结生成失败：${(e as Error).message}）`;
  }

  const html = buildReportHtml({ ...today, summary, knowledgeToday });
  try {
    await sendDailyReport(config.smtp.reportTo, html, dateStr);
    reportSentDate = dateStr;
    console.log(`[scheduler] daily report sent to ${config.smtp.reportTo}`);
  } catch (e) {
    console.error('[scheduler] send daily report failed:', (e as Error).message);
  }
}

function buildReportHtml(data: TodayView & { summary: string; knowledgeToday: { title: string; type: string }[] }) {
  const li = (arr: { title: string; [k: string]: unknown }[]) =>
    arr.length ? arr.map((t) => `<li>${t.title}</li>`).join('') : '<li>无</li>';
  const TYPE_ICON: Record<string, string> = {
    intel: '⚡', share: '🔗', note: '📝', rfc: '💬', guide: '📖', spec: '📐', adr: '⚖️',
  };
  const kbLi = data.knowledgeToday.length
    ? data.knowledgeToday.map((k) => `<li>${TYPE_ICON[k.type] ?? '📄'} ${k.title}</li>`).join('')
    : '';
  return `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;line-height:1.6;color:#334155">
      <h2 style="color:#4f46e5">Remainder 日报 · ${data.date}</h2>
      ${data.summary ? `<div style="background:#eef2ff;padding:12px;border-radius:8px;margin-bottom:16px">${data.summary}</div>` : ''}
      <h3 style="color:#16a34a">✅ 今日已完成</h3>
      <ul>${li(data.today.filter((t) => t.status === 'done'))}</ul>
      <h3 style="color:#dc2626">⏰ 逾期待办</h3>
      <ul>${li(data.overdue)}</ul>
      <h3 style="color:#2563eb">📅 今日到期待办</h3>
      <ul>${li(data.today.filter((t) => t.status !== 'done'))}</ul>
      <h3 style="color:#d97706">🤝 今日待跟进</h3>
      <ul>${li(data.followUps)}</ul>
      ${kbLi ? `<h3 style="color:#7c3aed">📚 今日知识库动态</h3><ul>${kbLi}</ul>` : ''}
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
      <p style="font-size:12px;color:#94a3b8">Sent by Remainder at ${new Date().toLocaleString('zh-CN')}</p>
    </div>
  `;
}

export function startScheduler() {
  checkReminders();
  const interval = setInterval(() => {
    checkReminders();
    checkDailyReport().catch((e) => console.error('[scheduler]', e));
  }, 60_000);
  return () => clearInterval(interval);
}

export function getNotifications() {
  return notifications.slice();
}

/** 推一条通知进队列（M25 @人 P0 必达）：桌面端轮询 /api/notifications 取走弹 toast */
export function pushNotification(title: string, refId = '') {
  if (!config.notifyEnabled) return;
  notifications.push({ id: randomUUID(), taskId: refId, title, fireAt: now() });
}

export function clearNotifications() {
  notifications.length = 0;
}
