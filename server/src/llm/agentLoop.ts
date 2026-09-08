/**
 * A1 agent loop（M31）：DeepSeek function calling 多轮决策。
 * ≤8 轮硬上限（防失控烧钱）；轨迹（tool/params/result）随回复返回，进动作卡片。
 */
import { getLlmConfig } from './index.js';
import { AGENT_TOOLS, executeTool, type ToolCallRecord } from './agentTools.js';

interface ChatMsg {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

const MAX_ROUNDS = 8;

function systemPrompt(today: string): string {
  return `你是 Remainder 的个人助理，可以通过工具直接操作用户的任务/文档/日程系统。今天是 ${today}。

工作原则：
- 用户用自然语言下达操作指令时，果断调用工具完成，不要只是口头建议
- 需要多步的操作（如"把某文档整理好格式并移到某文件夹"）按顺序连续调用：search_documents → read_document → format_document → move_document
- 查询类问题（今天安排/逾期/本周进展）用 query_schedule 拿到真实数据再回答，不要编造
- 标题/名称匹配不上时，先 search 类工具找到准确目标再操作
- 全部完成后用中文简要汇报做了什么（一两句话），不要重复工具返回的明细`;
}

export interface AgentReply {
  reply: string;
  actions: ToolCallRecord[];
}

export async function agentReply(message: string, today: string): Promise<AgentReply | null> {
  const llm = getLlmConfig();
  if (!llm.enabled || !llm.apiKey) return null;

  const messages: ChatMsg[] = [
    { role: 'system', content: systemPrompt(today) },
    { role: 'user', content: message },
  ];
  const actions: ToolCallRecord[] = [];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await fetch(`${llm.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${llm.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: llm.model,
        messages,
        tools: AGENT_TOOLS.map((t) => ({ type: 'function', function: t })),
        tool_choice: 'auto',
        temperature: 0.3,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`LLM error ${res.status}: ${err.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[];
    };
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error('LLM 返回空消息');

    // 无工具调用 → 终局回复
    if (!msg.tool_calls?.length) {
      return { reply: (msg.content ?? '').trim() || '（无回复）', actions };
    }

    // 执行工具并回喂
    messages.push({ role: 'assistant', content: msg.content ?? null, tool_calls: msg.tool_calls });
    for (const call of msg.tool_calls) {
      let params: Record<string, unknown> = {};
      try {
        params = JSON.parse(call.function.arguments || '{}');
      } catch {
        /* 参数 JSON 损坏按空对象 */
      }
      let result: string;
      try {
        result = await executeTool(call.function.name, params);
      } catch (e) {
        result = `执行异常：${(e as Error).message}`;
      }
      actions.push({ tool: call.function.name, params, result });
      messages.push({ role: 'tool', tool_call_id: call.id, content: result });
    }
  }

  return { reply: '（操作步骤较多，已达上限。已完成的动作见下方卡片）', actions };
}
