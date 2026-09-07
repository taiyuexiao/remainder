import { db } from '../db/connection.js';
import { config } from '../config.js';
import type { TodayView } from '../routes/helpers.js';
import { stripToText } from '../services/docSearch.js';

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

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** 流式 chat（M29：feishu-clone AI 侧栏走 server 代理，key 不出 server）；未启用返回 null */
export async function streamChatCompletion(messages: ChatMessage[]): Promise<Response | null> {
  const llm = getLlmConfig();
  if (!llm.enabled || !llm.apiKey) return null;
  return fetch(`${llm.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${llm.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: llm.model, messages, stream: true, temperature: 0.7 }),
  });
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

/** 就选中内容向 LLM 提问（M16；未配置返回 null） */
export async function askAboutText(text: string, question: string): Promise<string | null> {
  return chat(
    '你是用户的阅读助手。用户选中了文档中的一段内容并向你提问。请基于该内容准确、简洁地回答（一两段话以内）；内容里没有的信息要明确说明，不要编造。',
    `选中内容：\n${text}\n\n问题：${question}`,
    0.4,
  );
}

/** 文档排版（M16）：规范标题层级与列表结构，不改实质内容；未配置返回 null */
export async function formatDocument(text: string): Promise<string | null> {
  return chat(
    '你是文档排版助手。用户会给你一份文档全文（可能带 # 标题、- 列表等部分 Markdown 标记）。要求：' +
      '1) 规范标题层级（# / ## / ###，层级合理递进，不跳级）；' +
      '2) 明显属于列举的内容用 - 或 1. 标记为列表；' +
      '3) 不改动任何实质文字，不增删句子，不输出解释。直接输出整理后的全文。',
    text,
    0.2,
  );
}

/** 错别字流处理（M18）：只修错别字，其他一律不动；无错别字返回原文；未配置返回 null */
export async function fixTypos(text: string): Promise<string | null> {
  return chat(
    '你是错别字修正器。只修正文本中的错别字（同音字、形近字、多字漏字），不改动其他任何内容（语序、标点、格式、专有名词、数字、英文）。如果没有错别字，原样返回输入文本。只输出最终文本，不要任何解释。',
    text,
    0.1,
  );
}

/** 错别字批处理检查（M18）：返回 JSON 数组；未配置返回 null */
export async function checkTypos(text: string): Promise<string | null> {
  return chat(
    '你是错别字检查器。找出文本中的错别字（同音字、形近字、多字漏字），不要挑语病、标点或风格问题，不要改专有名词和英文。' +
      '输出 JSON 数组，每项形如 {"before":"错误的词","after":"正确的词","context":"包含错误词的原文短句（20字以内）"}。没有发现错别字就输出 []。只输出 JSON，不要输出其他任何内容。',
    text,
    0.1,
  );
}

/** AI 助手动作（M19）：从自然语言中抽取的结构化操作 */
export interface ChatAction {
  action: 'create_task';
  title: string;
  type?: 'main' | 'side' | 'follow' | 'idea';
  project?: string;
  ddl?: string;
  person?: string;
  next_follow_date?: string;
}

/** AI 助手对话（M19）：闲聊 + 自然语言建任务。返回 {reply, actions}；未配置返回 null */
export async function chatAssistant(
  message: string,
  today: string,
  projectNames: string[],
): Promise<{ reply: string; actions: ChatAction[] } | null> {
  const raw = await chat(
    `你是 Remainder 个人任务管理助手的对话引擎。今天是 ${today}。用户现有项目：${projectNames.join('、') || '（无）'}。` +
      '如果用户的话中包含要创建任务/日程/计划/截止/提醒/催办的意图，在 actions 数组中给出结构化动作；纯闲聊则 actions 为空数组。' +
      '动作格式：{"action":"create_task","title":"任务标题","type":"main|side|follow|idea",' +
      '"project":"归属项目名（能对应到现有项目才填，否则省略）","ddl":"YYYY-MM-DD（有明确截止才填）",' +
      '"person":"被催人（跟进型才填）","next_follow_date":"YYYY-MM-DD（跟进型才填）"}。' +
      'type 判断：大块的开发/项目类任务=main；零散事项=side；需要催促别人推进的=follow；灵感想法=idea。' +
      'reply 是给用户的自然语言回复（一两句话，确认你理解了；如果创建了任务，说明创建了什么）。' +
      '只输出 JSON：{"reply":"...","actions":[...]}，不要输出其他任何内容。',
    message,
    0.3,
  );
  if (raw === null) return null;
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(m ? m[0] : raw);
    return {
      reply: typeof parsed.reply === 'string' ? parsed.reply : '好的。',
      actions: Array.isArray(parsed.actions)
        ? parsed.actions.filter((a: ChatAction) => a?.action === 'create_task' && a?.title?.trim())
        : [],
    };
  } catch {
    return { reply: raw.slice(0, 500), actions: [] };
  }
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

/** 文档自动归档：单条输入 */
export interface OrganizeDocInput {
  id: string;
  title: string;
  summary: string;
  text: string;
}

/** 文档自动归档：建议分类 */
export interface OrganizeSuggestion {
  name: string;
  docIds: string[];
}

/** LLM 预览归档建议；未配置 LLM 返回 null */
export async function previewAutoOrganize(
  docs: OrganizeDocInput[],
  existingFolders: string[],
): Promise<OrganizeSuggestion[] | null> {
  if (!docs.length) return [];
  const result = await chat(
    '你是一位文档管理员。请根据文档标题、摘要和正文片段，把它们归类到合适的文件夹。' +
      '要求：\n' +
      '1. 文件夹名用中文，简洁（2-6 字）\n' +
      '2. 主题相近的文档归到一起\n' +
      '3. 如果是周报/日报，单独归到「周报」\n' +
      '4. 如果是剪藏的技术文章，可归到「技术剪藏」\n' +
      '5. 优先使用现有文件夹名，需要新建时再创新名字\n' +
      '6. 返回严格 JSON，不要 markdown 代码块：{ "folders": [{ "name": "...", "docIds": ["..."] }] }\n' +
      `现有文件夹：${existingFolders.join('、') || '无'}。`,
    `待分类文档：\n${docs
      .map(
        (d) =>
          `ID:${d.id}\n标题：${d.title}\n摘要：${d.summary || '无'}\n正文：${d.text.slice(0, 800)}`,
      )
      .join('\n---\n')}`,
    0.3,
  );
  if (!result) return null;
  try {
    const parsed = JSON.parse(result.replace(/^```json\s*|\s*```$/g, '')) as {
      folders?: { name?: string; docIds?: string[] }[];
    };
    return (parsed.folders ?? [])
      .filter((f) => f.name && Array.isArray(f.docIds))
      .map((f) => ({ name: f.name!.trim(), docIds: f.docIds! }));
  } catch {
    throw new Error('LLM 返回的归档建议格式无法解析');
  }
}

/** 从 documents 表提取用于归档的文本片段 */
export function getDocTextForOrganize(content: string): string {
  try {
    const json = JSON.parse(content);
    return stripToText(JSON.stringify(json));
  } catch {
    return stripToText(content);
  }
}
