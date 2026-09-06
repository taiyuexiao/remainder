import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT ?? 3210),
  /** 监听地址：默认仅本机回环；联机模式设 HOST=0.0.0.0 */
  host: process.env.HOST ?? '127.0.0.1',
  /** 联机共享 token：非回环监听时强制校验（x-team-token 头）；回环时免校验 */
  teamToken: process.env.TEAM_TOKEN ?? '',
  smtp: {
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    reportTo: process.env.REPORT_TO ?? '',
    reportTime: process.env.REPORT_TIME ?? '21:00',
  },
  llm: {
    baseUrl: process.env.LLM_BASE_URL ?? 'https://api.deepseek.com',
    apiKey: process.env.LLM_API_KEY ?? '',
    model: process.env.LLM_MODEL ?? 'deepseek-chat',
    enabled: process.env.LLM_ENABLED === 'true',
  },
  notifyEnabled: process.env.NOTIFY_ENABLED !== 'false',
};
