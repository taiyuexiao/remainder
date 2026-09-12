/**
 * agent loop（M31 A1；M34 A3/A4）：DeepSeek function calling 多轮决策。
 * ≤8 轮硬上限（防失控烧钱）；轨迹（tool/params/result）随回复返回，进动作卡片；
 * 轮次级轨迹（thought/calls）落 agent_runs 供回放；client_actions 驱动前端页面联动。
 */
import { getLlmConfig } from './index.js';
import { AGENT_TOOLS, executeTool, type ToolCallRecord, type UndoInfo, type ClientAction } from './agentTools.js';

export interface AgentActionRecord extends ToolCallRecord {
  undo?: UndoInfo;
  clientAction?: ClientAction;
}

/** 轮次级轨迹（A4 轨迹回放） */
export interface AgentRound {
  thought: string | null;
  calls: { tool: string; params: Record<string, unknown>; result: string }[];
}

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
  return `你是 Remainder 的个人助理，可以通过工具直接操作用户的任务/文档/日程/知识库/剪藏/报告系统。今天是 ${today}。

工作原则：
- 用户用自然语言下达操作指令时，果断调用工具完成，不要只是口头建议
- 需要多步的操作（如“把某文档整理好格式并移到某文件夹”）按顺序连续调用：search_documents → read_document → format_document → move_document
- 查询类问题（今天安排/逾期/本周进展）用 query_schedule 拿到真实数据再回答，不要编造
- 标题/名称匹配不上时，先 search 类工具找到准确目标再操作
- 操作完成后如果用户可能想看到结果（打开文档/看报告/看知识库），调用 open_document 或 navigate_to 把界面带过去
- 全部完成后用中文简要汇报做了什么（一两句话），不要重复工具返回的明细`;
}

export interface AgentReply {
  reply: string;
  actions: AgentActionRecord[];
  clientActions: ClientAction[];
  rounds: AgentRound[];
}

export async function agentReply(message: string, today: string): Promise<AgentReply | null> {
  const llm = getLlmConfig();
  if (!llm.enabled || !llm.apiKey) return null;

  const messages: ChatMsg[] = [
    { role: 'system', content: systemPrompt(today) },
    { role: 'user', content: message },
  ];
  const actions: AgentActionRecord[] = [];
  const clientActions: ClientAction[] = [];
  const rounds: AgentRound[] = [];

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
      if (msg.content?.trim() && rounds.length) {
        rounds.push({ thought: msg.content.trim(), calls: [] });
      }
      return { reply: (msg.content ?? '').trim() || '（无回复）', actions, clientActions, rounds };
    }

    // 执行工具并回喂（同时记录轮次轨迹）
    const round: AgentRound = { thought: msg.content?.trim() || null, calls: [] };
    messages.push({ role: 'assistant', content: msg.content ?? null, tool_calls: msg.tool_calls });
    for (const call of msg.tool_calls) {
      let params: Record<string, unknown> = {};
      try {
        params = JSON.parse(call.function.arguments || '{}');
      } catch {
        /* 参数 JSON 损坏按空对象 */
      }
      let execResult: string;
      let undo: UndoInfo | undefined;
      let clientAction: ClientAction | undefined;
      try {
        const r = await executeTool(call.function.name, params);
        execResult = r.result;
        undo = r.undo;
        clientAction = r.clientAction;
      } catch (e) {
        execResult = `执行异常：${(e as Error).message}`;
      }
      actions.push({ tool: call.function.name, params, result: execResult, undo, clientAction });
      if (clientAction) clientActions.push(clientAction);
      round.calls.push({ tool: call.function.name, params, result: execResult });
      messages.push({ role: 'tool', tool_call_id: call.id, content: execResult });
    }
    rounds.push(round);
  }

  return { reply: '（操作步骤较多，已达上限。已完成的动作见下方卡片）', actions, clientActions, rounds };
}

/**
 * A4 plan 确认模式：不挂工具，让 LLM 只产出编号执行计划，由用户确认后再执行。
 */
export async function agentPlan(message: string, today: string): Promise<string | null> {
  const llm = getLlmConfig();
  if (!llm.enabled || !llm.apiKey) return null;

  const toolList = AGENT_TOOLS.map((t) => `- ${t.name}：${t.description}`).join('\n');
  const messages = [
    {
      role: 'system',
      content: `你是 Remainder 个人助理的规划器。今天是 ${today}。用户会给出一个操作需求，你只输出执行计划，不要执行。

要求：
- 用编号列表输出 1~8 步，每步一句话说明要做什么、用哪个工具
- 如果需求本身就是简单问答或单步操作，直接回答“无需计划，直接执行即可”并给出一步说明
- 不要编造不存在的工具

可用工具：
${toolList}`,
    },
    { role: 'user', content: message },
  ];
  const res = await fetch(`${llm.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${llm.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: llm.model, messages, temperature: 0.3 }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM error ${res.status}: ${err.slice(0, 300)}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
  return (data.choices?.[0]?.message?.content ?? '').trim() || null;
}
