import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Conversation, type ChatMessage, type AgentActionItem, type AgentRun } from '../api/client';
import { requestOpenDoc, requestNav } from '../navBus';

/**
 * AI 助手页（M19）：GPT/豆包式布局 —— 左侧会话历史 + 主对话区
 * M31 agent loop 动作卡片；M32 撤销；M34 计划模式（A4）+ 轨迹回放（A4）+ 前端联动（A3）
 */

/** 执行 agent 返回的前端联动动作（A3 client_actions） */
function runClientActions(list?: { type: string; docId?: string; page?: string }[]) {
  for (const ca of list ?? []) {
    if (ca.type === 'open_doc' && ca.docId) requestOpenDoc(ca.docId);
    else if (ca.type === 'nav' && ca.page) requestNav(ca.page);
  }
}
export default function ChatPage() {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [undoneIds, setUndoneIds] = useState<Set<string>>(new Set());
  const [planMode, setPlanMode] = useState(false);
  const [trace, setTrace] = useState<{ loading: boolean; run?: AgentRun; error?: string } | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  const loadConvs = useCallback(async () => {
    try {
      setConvs(await api.listConversations());
      setError('');
    } catch (e) {
      setError(`加载失败：${(e as Error).message}`);
    }
  }, []);

  useEffect(() => {
    loadConvs();
  }, [loadConvs]);

  const openConv = async (id: string) => {
    setCurrentId(id);
    try {
      const detail = await api.getConversation(id);
      setMessages(detail.messages);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // 滚动到底部
  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const newConv = async () => {
    const conv = await api.createConversation();
    await loadConvs();
    setCurrentId(conv.id);
    setMessages([]);
  };

  const removeConv = async (id: string) => {
    if (!confirm('删除该会话？')) return;
    await api.deleteConversation(id);
    if (currentId === id) {
      setCurrentId(null);
      setMessages([]);
    }
    await loadConvs();
  };

  /** 发送；override 用于「执行计划」（A4）：content=原始需求，executePlan=已确认计划文本 */
  const send = async (override?: { content: string; executePlan?: string; planMsgId?: string }) => {
    const text = (override?.content ?? input).trim();
    if (!text || sending) return;
    let convId = currentId;
    if (!convId) {
      const conv = await api.createConversation();
      convId = conv.id;
      setCurrentId(convId);
      loadConvs();
    }
    if (!override) setInput('');
    setSending(true);
    const optimistic: ChatMessage = {
      id: `tmp-${Date.now()}`,
      role: 'user',
      content: override?.executePlan ? `✅ 执行计划：${text}` : text,
      actions: [],
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    try {
      const res = await api.sendChatMessage(convId, text, {
        planMode: override ? false : planMode,
        executePlan: override?.executePlan,
        planMsgId: override?.planMsgId,
      });
      setMessages((m) => [
        ...m,
        { id: res.id, role: 'assistant', content: res.content, actions: res.applied, created_at: new Date().toISOString() },
      ]);
      // 计划被执行：本地同步计划卡片状态
      if (override?.planMsgId) {
        setMessages((ms) =>
          ms.map((msg) =>
            msg.id === override.planMsgId
              ? { ...msg, actions: msg.actions.map((a) => (typeof a !== 'string' && a.tool === 'plan' ? { ...a, planStatus: 'executed' as const } : a)) }
              : msg,
          ),
        );
      }
      runClientActions(res.clientActions); // A3：agent 驱动页面跳转
      loadConvs(); // 标题/预览更新
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `⚠ ${(e as Error).message}`,
          actions: [],
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  /** 取消待执行计划（A4） */
  const cancelPlan = async (msgId: string) => {
    if (!currentId) return;
    try {
      await api.cancelPlan(currentId, msgId);
      setMessages((ms) =>
        ms.map((msg) =>
          msg.id === msgId
            ? { ...msg, actions: msg.actions.map((a) => (typeof a !== 'string' && a.tool === 'plan' ? { ...a, planStatus: 'cancelled' as const } : a)) }
            : msg,
        ),
      );
    } catch (e) {
      alert((e as Error).message);
    }
  };

  /** 打开轨迹回放（A4） */
  const openTrace = async (msgId: string) => {
    setTrace({ loading: true });
    try {
      const run = await api.getAgentRun(msgId);
      setTrace({ loading: false, run });
    } catch (e) {
      setTrace({ loading: false, error: (e as Error).message });
    }
  };

  /** 找某条助手消息之前最近的用户消息（执行计划时的原始需求） */
  const lastUserMsgBefore = (msgId: string): string => {
    const idx = messages.findIndex((m) => m.id === msgId);
    for (let i = idx - 1; i >= 0; i--) {
      if (messages[i].role === 'user') return messages[i].content;
    }
    return '';
  };

  const fmtTime = (s: string) => s.slice(5, 16).replace('T', ' ');

  return (
    <div className="h-full flex">
      {/* 左侧：会话历史 */}
      <aside className="w-60 shrink-0 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-3 border-b border-slate-100">
          <button
            onClick={newConv}
            className="w-full rounded-lg bg-indigo-600 text-white text-sm py-2 hover:bg-indigo-700 transition-colors"
          >
            + 新对话
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          {convs.length === 0 && (
            <p className="text-xs text-slate-400 text-center pt-8">还没有会话</p>
          )}
          {convs.map((c) => (
            <div
              key={c.id}
              onClick={() => openConv(c.id)}
              className={`group rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                currentId === c.id ? 'bg-indigo-50' : 'hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium truncate flex-1 ${currentId === c.id ? 'text-indigo-700' : 'text-slate-700'}`}>
                  {c.title}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeConv(c.id);
                  }}
                  className="hidden group-hover:block text-slate-300 hover:text-red-400 text-xs"
                  title="删除会话"
                >
                  🗑
                </button>
              </div>
              {c.last_message && (
                <p className="text-[10px] text-slate-400 truncate mt-0.5">{c.last_message}</p>
              )}
            </div>
          ))}
        </div>
      </aside>

      {/* 主对话区 */}
      <main className="flex-1 min-w-0 flex flex-col bg-slate-50">
        {error && <div className="px-4 py-2 text-xs text-red-500 bg-red-50">{error}</div>}

        {/* 消息流 */}
        <div ref={threadRef} className="flex-1 overflow-y-auto px-6 py-6">
          {!currentId && messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-indigo-100 flex items-center justify-center text-2xl">🤖</div>
              <div>
                <p className="text-sm font-medium text-slate-700">有什么可以帮你？</p>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                  试试自然语言安排任务：<br />
                  「明天下午 5 点前交周报」<br />
                  「下周三之前催一下张三的审批」<br />
                  「帮我想想评测平台还缺什么」
                </p>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-4">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] ${m.role === 'user' ? '' : 'w-full'}`}>
                    <div
                      className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                        m.role === 'user'
                          ? 'bg-indigo-600 text-white rounded-br-md'
                          : 'bg-white border border-slate-200 text-slate-700 rounded-bl-md shadow-sm'
                      }`}
                    >
                      {m.content}
                    </div>
                    {/* 已执行动作卡片（A2 可撤销；A4 plan 卡片） */}
                    {m.actions.length > 0 && (
                      <div className="mt-1.5 space-y-1">
                        {m.actions.map((a: AgentActionItem, i) => {
                          // A4 计划卡片：待确认的计划，[执行] [取消]
                          if (typeof a !== 'string' && a.tool === 'plan') {
                            return (
                              <div key={i} className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2">
                                <div className="text-xs text-indigo-700 whitespace-pre-wrap leading-relaxed">{a.text}</div>
                                <div className="mt-2 flex items-center gap-2">
                                  {a.planStatus === 'pending' && (
                                    <>
                                      <button
                                        disabled={sending}
                                        onClick={() => send({ content: lastUserMsgBefore(m.id), executePlan: a.text, planMsgId: m.id })}
                                        className="rounded-lg bg-indigo-600 text-white text-xs px-3 py-1 hover:bg-indigo-700 disabled:opacity-40"
                                      >
                                        ▶ 执行计划
                                      </button>
                                      <button
                                        onClick={() => cancelPlan(m.id)}
                                        className="rounded-lg border border-slate-300 text-slate-500 text-xs px-3 py-1 hover:bg-slate-100"
                                      >
                                        取消
                                      </button>
                                    </>
                                  )}
                                  {a.planStatus === 'executed' && <span className="text-xs text-emerald-600">✓ 已执行</span>}
                                  {a.planStatus === 'cancelled' && <span className="text-xs text-slate-400">已取消</span>}
                                </div>
                              </div>
                            );
                          }
                          const text = typeof a === 'string' ? a : a.text;
                          const undoable = typeof a !== 'string' && a.undoable && !undoneIds.has(a.id);
                          const isUndone = typeof a !== 'string' && undoneIds.has(a.id);
                          return (
                            <div
                              key={i}
                              className={`inline-flex items-center gap-1.5 rounded-lg border text-xs px-2.5 py-1 mr-1.5 ${
                                isUndone
                                  ? 'bg-slate-50 border-slate-200 text-slate-400 line-through'
                                  : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                              }`}
                            >
                              ✓ {text}
                              {undoable && (
                                <button
                                  onClick={async () => {
                                    if (!confirm('撤销这一步操作？')) return;
                                    try {
                                      await api.undoAgentAction((a as { id: string }).id);
                                      setUndoneIds((prev) => new Set(prev).add((a as { id: string }).id));
                                    } catch (e) {
                                      alert((e as Error).message);
                                    }
                                  }}
                                  className="text-emerald-500 hover:text-red-500 font-medium"
                                  title="撤销"
                                >
                                  ↩
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <p className={`text-[10px] text-slate-300 mt-1 ${m.role === 'user' ? 'text-right' : ''}`}>
                      {fmtTime(m.created_at)}
                      {/* A4 轨迹回放入口 */}
                      {m.role === 'assistant' && !m.id.startsWith('tmp-') && !m.id.startsWith('err-') && (
                        <button
                          onClick={() => openTrace(m.id)}
                          className="ml-2 text-slate-300 hover:text-indigo-400 underline underline-offset-2"
                        >
                          轨迹
                        </button>
                      )}
                    </p>
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-md bg-white border border-slate-200 px-4 py-2.5 text-sm text-slate-400 shadow-sm">
                    思考中<span className="animate-pulse">…</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 输入区 */}
        <div className="shrink-0 border-t border-slate-200 bg-white px-6 py-4">
          <div className="max-w-3xl mx-auto">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100 transition-all flex items-end gap-2 p-2">
              <textarea
                className="flex-1 bg-transparent px-2 py-1.5 text-sm resize-none focus:outline-none placeholder:text-slate-400"
                rows={Math.min(4, input.split('\n').length + (input.length > 40 ? 1 : 0) || 1)}
                placeholder="输入消息，或直接用自然语言安排任务…（Enter 发送，Shift+Enter 换行）"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              <button
                onClick={() => send()}
                disabled={!input.trim() || sending}
                className="rounded-xl bg-indigo-600 text-white text-sm px-4 py-2 hover:bg-indigo-700 disabled:opacity-40 transition-colors shrink-0"
              >
                发送
              </button>
            </div>
            {/* A4 计划模式开关：先出执行计划，确认后再动手 */}
            <div className="flex items-center justify-center gap-1.5 mt-1.5">
              <button
                onClick={() => setPlanMode((v) => !v)}
                className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                  planMode
                    ? 'bg-indigo-100 border-indigo-300 text-indigo-600'
                    : 'border-slate-200 text-slate-300 hover:text-slate-400'
                }`}
                title="开启后：AI 先给出执行计划，你确认后才真正执行"
              >
                {planMode ? '📋 计划模式：开' : '📋 计划模式'}
              </button>
            </div>
            <p className="text-[10px] text-slate-300 mt-1.5 text-center">
              任务类意图会自动同步到对应板块（主线/支线/跟进/想法）
            </p>
          </div>
        </div>
      </main>
      {/* A4 轨迹回放模态 */}
      {trace && (
        <div
          className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center"
          onMouseDown={(e) => e.target === e.currentTarget && setTrace(null)}
        >
          <div className="bg-white rounded-xl shadow-xl w-[560px] max-w-[90vw] max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <span className="text-sm font-medium text-slate-700">执行轨迹</span>
              <button onClick={() => setTrace(null)} className="text-slate-300 hover:text-slate-500">×</button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {trace.loading && <p className="text-xs text-slate-400">加载中…</p>}
              {trace.error && <p className="text-xs text-slate-400">{trace.error}</p>}
              {trace.run && trace.run.rounds.length === 0 && (
                <p className="text-xs text-slate-400">本轮没有调用工具</p>
              )}
              {trace.run?.rounds.map((r, i) => (
                <div key={i} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                  <div className="text-[10px] text-slate-400 mb-1">第 {i + 1} 轮</div>
                  {r.thought && <p className="text-xs text-slate-600 mb-1.5">💭 {r.thought}</p>}
                  {r.calls.map((c, j) => (
                    <div key={j} className="text-xs mb-1">
                      <span className="font-mono text-indigo-600">🔧 {c.tool}</span>
                      <span className="text-slate-400">({JSON.stringify(c.params).slice(0, 80)})</span>
                      <div className="text-slate-500 mt-0.5 whitespace-pre-wrap">→ {c.result.slice(0, 200)}</div>
                    </div>
                  ))}
                  {!r.calls.length && !r.thought && <p className="text-xs text-slate-400">（空轮次）</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
