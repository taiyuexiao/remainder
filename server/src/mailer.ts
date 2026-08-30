import nodemailer from 'nodemailer';
import { config } from './config.js';

const transporter = config.smtp.user
  ? nodemailer.createTransport({
      host: 'smtp.163.com',
      port: 465,
      secure: true,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    })
  : null;

export async function sendDailyReport(to: string, html: string, date: string) {
  if (!transporter) {
    throw new Error('SMTP 未配置（SMTP_USER/SMTP_PASS）');
  }
  await transporter.sendMail({
    from: `"Remainder" <${config.smtp.user}>`,
    to,
    subject: `Remainder 日报 · ${date}`,
    html,
  });
}
