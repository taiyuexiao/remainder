import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Conversation, type ChatMessage } from '../api/client';

/**
 * AI 助手页（M19）：GPT/豆包式布局 —— 左侧会话历史 + 主对话区
 * 支持自然语言建任务（"明天下午交周报""提醒我下周催张三审批"），LLM 抽取动作直接落库
 */
export default function ChatPage() {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
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

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    let convId = currentId;
    if (!convId) {
      const conv = await api.createConversation();
      convId = conv.id;
      setCurrentId(convId);
      loadConvs();
    }
    setInput('');
    setSending(true);
    const optimistic: ChatMessage = {
      id: `tmp-${Date.now()}`,
      role: 'user',
      content: text,
      actions: [],
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    try {
      const res = await api.sendChatMessage(convId, text);
      setMessages((m) => [
        ...m,
        { id: res.id, role: 'assistant', content: res.content, actions: res.applied, created_at: new Date().toISOString() },
      ]);
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
                    {/* 已执行动作卡片 */}
                    {m.actions.length > 0 && (
                      <div className="mt-1.5 space-y-1">
                        {m.actions.map((a, i) => (
                          <div
                            key={i}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs px-2.5 py-1 mr-1.5"
                          >
                            ✓ {a}
                          </div>
                        ))}
                      </div>
                    )}
                    <p className={`text-[10px] text-slate-300 mt-1 ${m.role === 'user' ? 'text-right' : ''}`}>
                      {fmtTime(m.created_at)}
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
                onClick={send}
                disabled={!input.trim() || sending}
                className="rounded-xl bg-indigo-600 text-white text-sm px-4 py-2 hover:bg-indigo-700 disabled:opacity-40 transition-colors shrink-0"
              >
                发送
              </button>
            </div>
            <p className="text-[10px] text-slate-300 mt-1.5 text-center">
              任务类意图会自动同步到对应板块（主线/支线/跟进/想法）
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
