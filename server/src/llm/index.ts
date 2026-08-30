import { db } from '../db/connection.js';
import { config } from '../config.js';
import type { TodayView } from '../routes/helpers.js';

interface LlmConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** 运行时从 settings 表读取 LLM 配置；未配置则回退到 .env/config */
function getLlmConfig(): LlmConfig {
  const get = (key: string) => {
    try {
      return (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value?: string } | undefined)
        ?.value;
    } catch {
      return undefined;
    }
  };

  const enabledRaw = get('llm_enabled');
  const enabled = enabledRaw !== undefined ? enabledRaw === 'true' : config.llm.enabled;

  return {
    enabled,
    baseUrl: get('llm_base_url') ?? config.llm.baseUrl,
    apiKey: get('llm_api_key') ?? config.llm.apiKey,
    model: get('llm_model') ?? config.llm.model,
  };
}

/** OpenAI 兼容 chat 调用；未启用/无 key 返回 null，调用失败抛错 */
async function chat(system: string, user: string, temperature = 0.7): Promise<string | null> {
  const llm = getLlmConfig();
  if (!llm.enabled || !llm.apiKey) return null;
  const r = await fetch(`${llm.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${llm.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: llm.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature,
    }),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`LLM error ${r.status}: ${err}`);
  }
  const data = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content?.trim() ?? null;
}

/** 周报聚合数据（routes/llm.ts 组装） */
export interface WeeklyData {
  weekStart: string;
  weekEnd: string;
  doneProjects: { name: string; type: string }[];
  doneTasks: { title: string; project_name: string | null }[];
  doingProjects: { name: string; type: string; done_count: number; total_count: number }[];
  doingTasks: { title: string; project_name: string | null; ddl: string | null }[];
  overdueTasks: { title: string; project_name: string | null; ddl: string | null }[];
  followUps: { name: string; person: string | null; next_follow_date: string | null; urge_count: number | null }[];
}

/** 生成本周周报（Markdown；未配置 LLM 返回 null） */
export async function generateWeeklyReport(week: WeeklyData): Promise<string | null> {
  return chat(
    '你是一位资深程序员，正在写自己的本周工作周报。要求：Markdown 格式，包含以下小节（用 ## 标题）：本周完成 / 进行中 / 风险与逾期 / 跟进情况 / 下周计划。' +
      '语气务实简洁，像程序员写给leader看的；只能基于给定数据总结，不要编造不存在的任务或数字；下周计划一节可根据进行中事项给出建议并标注（建议）。',
    `本周范围：${week.weekStart} ~ ${week.weekEnd}\n数据：\n${JSON.stringify(week, null, 2)}`,
    0.5,
  );
}

/** 润色文本（默认：更专业清晰的职场书面表达；未配置 LLM 返回 null） */
export async function polishText(text: string, instruction?: string): Promise<string | null> {
  const inst = instruction?.trim() || '改写得更专业、清晰，保持原意，用职场书面表达';
  return chat(
    `你是一位文字编辑。请按以下要求处理用户给出的文本：${inst}。只输出处理后的文本本身，不要解释、不要加引号。`,
    text,
    0.3,
  );
}

/** 桌宠对话（蕾米埃尔人格；未配置 LLM 返回 null） */
export async function petChat(message: string, todayHint?: string): Promise<string | null> {
  return chat(
    '你是蕾米埃尔·丹，一只住在用户电脑桌面上的可爱桌宠，性格活泼聪明、有点小傲娇但关心用户的工作。' +
      '用户是一位程序员。用中文回答，一两句话以内，语气像闲聊。' +
      (todayHint ? `用户今天的待办参考：${todayHint}。` : ''),
    message,
    0.8,
  );
}

/** 生成今日日报总结（未配置 LLM 返回 null） */
export async function generateDailySummary(today: TodayView): Promise<string | null> {
  return chat(
    '你是一位私人任务助理。请根据用户今日任务数据，用中文生成一段自然、简洁的日报总结（2-4 句话），包含：已完成的工作、当前待办的重点、明日建议。不要编造数据，语气像程序员对自己说话。',
    JSON.stringify(
      {
        已完成: today.today.filter((t) => t.status === 'done').map((t) => t.title),
        逾期待办: today.overdue.map((t) => t.title),
        今日到期待办: today.today.filter((t) => t.status !== 'done').map((t) => t.title),
        今日待跟进: today.followUps.map((t) => `${t.title}（${t.person ?? ''}）`),
      },
      null,
      2,
    ),
    0.7,
  );
}
