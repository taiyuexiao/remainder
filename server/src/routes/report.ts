import type { FastifyInstance } from 'fastify';
import { getTodayView } from '../services/today.js';
import { sendDailyReport } from '../mailer.js';
import { generateDailySummary } from '../llm/index.js';

export default async function reportRoutes(app: FastifyInstance) {
  app.post('/api/report/daily/send', async (req, reply) => {
    const { to, useLLM } = (req.body ?? {}) as { to?: string; useLLM?: boolean };
    if (!to) return reply.code(400).send({ error: 'to 必填' });

    const data = getTodayView();
    let summary = '';
    if (useLLM !== false) {
      try {
        summary = (await generateDailySummary(data as Parameters<typeof generateDailySummary>[0])) ?? '';
      } catch (e) {
        summary = `（LLM 总结生成失败：${(e as Error).message}）`;
      }
    }

    const li = (arr: { title: string; [k: string]: unknown }[]) =>
      arr.length ? arr.map((t) => `<li>${t.title}</li>`).join('') : '<li>无</li>';
    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;line-height:1.6;color:#334155">
        <h2 style="color:#4f46e5">Remainder 日报 · ${data.date}</h2>
        ${summary ? `<div style="background:#eef2ff;padding:12px;border-radius:8px;margin-bottom:16px">${summary}</div>` : ''}
        <h3 style="color:#16a34a">✅ 今日已完成</h3>
        <ul>${li(data.today.filter((t) => t.status === 'done'))}</ul>
        <h3 style="color:#dc2626">⏰ 逾期待办</h3>
        <ul>${li(data.overdue)}</ul>
        <h3 style="color:#2563eb">📅 今日到期待办</h3>
        <ul>${li(data.today.filter((t) => t.status !== 'done'))}</ul>
        <h3 style="color:#d97706">🤝 今日待跟进</h3>
        <ul>${li(data.followUps)}</ul>
      </div>
    `;

    try {
      await sendDailyReport(to, html, data.date);
      return { sent: true, to, summary: summary || undefined };
    } catch (e) {
      return reply.code(500).send({ error: (e as Error).message });
    }
  });
}
