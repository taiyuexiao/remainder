/**
 * 「问问AI」右侧对话栏（对齐飞书最新版浮条入口，能力增强）：
 * - 入口：浮动工具栏「问问AI / 解释」、斜杠菜单「AI帮我写」、一键排版配置引导
 * - 多轮流式对话；上下文取打开时的选区/所在段（可清除）
 * - 快捷指令：帮我写 / 续写 / 润色 / 翻译 / 总结
 * - 每条回答可：插入到下方 / 替代当前文本 / 作为引用插入 / 作为代码框插入 / 复制 / 重新生成
 * - 模型配置：用户自备 OpenAI 兼容服务，存 localStorage
 */
import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import {
  streamChat, loadAIConfig, saveAIConfig, hasAIConfig,
  type AIConfig, type ChatMessage,
} from './config'
import { appendBelow, replaceCurrent, insertAsQuote, insertAsCode } from './aiOps'
import type { AIOpenOptions } from '../slashHelpers'
import * as I from '../icons'

const SYSTEM_PROMPT = '你是云文档里的 AI 助手。直接输出结果正文，条理清晰；不要多余寒暄，不要用 Markdown 代码围栏包裹全文（代码块内容除外）。'

interface Msg {
  role: 'user' | 'assistant'
  content: string
}

const QUICK_ACTIONS: Array<{ key: string; label: string; prompt: string; useCtx: boolean }> = [
  { key: 'write', label: '帮我写', prompt: '', useCtx: false },
  { key: 'continue', label: '续写', prompt: '请基于以下内容继续撰写，保持原文风格与语气，直接输出续写正文：\n\n', useCtx: true },
  { key: 'polish', label: '润色', prompt: '请润色以下内容，使其更通顺专业，直接输出润色后的正文：\n\n', useCtx: true },
  { key: 'translate', label: '翻译成英文', prompt: '请将以下内容翻译成英文，直接输出译文：\n\n', useCtx: true },
  { key: 'summary', label: '总结', prompt: '请总结以下内容的要点，用简洁的条目输出：\n\n', useCtx: true },
]

export function AISidebar({ editor, seed, onClose }: {
  editor: Editor
  seed: AIOpenOptions & { context?: string }
  onClose: () => void
}) {
  const [cfg, setCfg] = useState<AIConfig>(() => loadAIConfig())
  const [configuring, setConfiguring] = useState(() => !hasAIConfig(loadAIConfig()))
  const [context, setContext] = useState<string>(() => (seed.context ?? '').trim())
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const sentSeedRef = useRef(false)

  const configured = hasAIConfig(cfg)

  const scrollBottom = () => {
    requestAnimationFrame(() => {
      bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight })
    })
  }

  const send = async (promptText: string, ctx?: string) => {
    const p = promptText.trim()
    if (!p || busy) return
    if (!configured) { setConfiguring(true); return }
    const c = (ctx ?? '').trim()
    const userContent = c ? `${p}\n\n〔参考内容〕\n${c}` : p
    const history: Msg[] = [...messages, { role: 'user', content: userContent }]
    setMessages([...history, { role: 'assistant', content: '' }])
    setInput('')
    setError('')
    setBusy(true)
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const chat: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
    ]
    try {
      await streamChat(cfg, chat, (chunk) => {
        setMessages((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: last.content + chunk }
          return next
        })
        scrollBottom()
      }, ctrl.signal)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message || '生成失败')
    } finally {
      setBusy(false)
      abortRef.current = null
    }
  }

  const stop = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setBusy(false)
  }

  /* 打开时自动执行（浮条「解释」等预设提示词） */
  useEffect(() => {
    if (sentSeedRef.current) return
    sentSeedRef.current = true
    if (seed.prompt && configured) void send(seed.prompt, seed.context) // eslint-disable-line react-hooks/set-state-in-effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveConfig = () => {
    saveAIConfig(cfg)
    setConfiguring(false)
  }

  const copyText = async (text: string) => {
    try { await navigator.clipboard.writeText(text) } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent('fe-toast', { detail: '已复制' }))
  }

  const insertActions = (text: string) => (
    <div className="fe-ai-msg-actions">
      <button onClick={() => { appendBelow(editor, text); window.dispatchEvent(new CustomEvent('fe-toast', { detail: '已插入到当前块下方' })) }}>插入到下方</button>
      <button onClick={() => { replaceCurrent(editor, text); window.dispatchEvent(new CustomEvent('fe-toast', { detail: '已替换当前文本' })) }}>替代当前文本</button>
      <button onClick={() => { insertAsQuote(editor, text); window.dispatchEvent(new CustomEvent('fe-toast', { detail: '已作为引用插入' })) }}>作为引用</button>
      <button onClick={() => { insertAsCode(editor, text); window.dispatchEvent(new CustomEvent('fe-toast', { detail: '已作为代码框插入' })) }}>代码框</button>
      <button onClick={() => void copyText(text)}>复制</button>
    </div>
  )

  const regenerate = (index: number) => {
    // 找到该回答对应的用户提问，重新发送
    for (let i = index - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        setMessages(messages.slice(0, i))
        const content = messages[i].content
        // 剥离历史里的参考内容块，仅重发问题本身
        const q = content.split('\n\n〔参考内容〕')[0]
        void send(q, context)
        return
      }
    }
  }

  return (
    <aside className="fe-ai-dock">
      <div className="fe-ai-dock-head">
        <span className="fe-ai-badge"><I.IconAI size={13} /></span>
        <span className="t">问问AI</span>
        <button className="fe-ai-dock-model" title="模型设置" onClick={() => setConfiguring((v) => !v)}>
          {cfg.model || '未配置'}
        </button>
        <button className="fe-ai-dock-close" title="关闭" onClick={onClose}><I.IconClose size={14} /></button>
      </div>

      {configuring ? (
        <div className="fe-ai-config">
          <div className="fe-ai-config-tip">
            使用你自己的模型服务（OpenAI Chat Completions 兼容协议）。配置仅保存在本机浏览器，请求由页面直接发往你填写的服务地址（需允许跨域）。
          </div>
          <label>API 地址（Base URL）</label>
          <input value={cfg.baseURL} placeholder="https://api.openai.com/v1"
            onChange={(e) => setCfg({ ...cfg, baseURL: e.target.value })} />
          <label>API Key</label>
          <input type="password" value={cfg.apiKey} placeholder="sk-..."
            onChange={(e) => setCfg({ ...cfg, apiKey: e.target.value })} />
          <label>模型名称</label>
          <input value={cfg.model} placeholder="gpt-4o-mini / deepseek-chat ..."
            onChange={(e) => setCfg({ ...cfg, model: e.target.value })} />
          <label>创造性 temperature：{cfg.temperature.toFixed(1)}</label>
          <input type="range" min={0} max={1.5} step={0.1} value={cfg.temperature}
            onChange={(e) => setCfg({ ...cfg, temperature: Number(e.target.value) })} />
          <div className="fe-ai-config-actions">
            <button className="fe-ai-btn ghost" onClick={saveConfig}>完成</button>
          </div>
        </div>
      ) : (
        <>
          {messages.length === 0 && (
            <div className="fe-ai-dock-empty">
              <div className="big">问我任何问题</div>
              <div className="sub">回答可插入到文档、替换所选文本、作为引用或代码框</div>
              {seed.quick && (
                <div className="fe-ai-chips">
                  {QUICK_ACTIONS.map((a) => (
                    <button key={a.key} className="fe-ai-chip"
                      onClick={() => {
                        if (a.key === 'write') {
                          document.querySelector<HTMLTextAreaElement>('.fe-ai-dock-input')?.focus()
                          return
                        }
                        void send(a.useCtx ? a.prompt + (context || '（无）') : a.prompt, context)
                      }}>
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="fe-ai-dock-body" ref={bodyRef}>
            {messages.map((m, i) => (
              m.role === 'user' ? (
                <div key={i} className="fe-ai-msg user">{m.content}</div>
              ) : (
                <div key={i} className="fe-ai-msg assistant">
                  <div className="fe-ai-msg-text">{m.content || (busy && i === messages.length - 1 ? '思考中…' : '')}</div>
                  {!busy && m.content && (
                    <>
                      {insertActions(m.content)}
                      <div className="fe-ai-msg-regen">
                        <button onClick={() => regenerate(i)}>重新生成</button>
                      </div>
                    </>
                  )}
                </div>
              )
            ))}
            {error && <div className="fe-ai-error">{error}</div>}
          </div>

          {context && (
            <div className="fe-ai-ctx" title={context}>
              <span className="lbl">参考内容</span>
              <span className="txt">{context.slice(0, 60)}{context.length > 60 ? '…' : ''}</span>
              <button className="fe-ai-ctx-clear" title="清除参考内容" onClick={() => setContext('')}><I.IconClose size={11} /></button>
            </div>
          )}

          <div className="fe-ai-dock-foot">
            <textarea
              className="fe-ai-dock-input"
              placeholder="输入问题，Enter 发送 / Shift+Enter 换行"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send(input, context)
                }
                e.stopPropagation()
              }}
            />
            <div className="fe-ai-dock-foot-row">
              <span className="fe-ai-model">{busy ? '生成中…' : 'Enter 发送'}</span>
              <span className="flex1" />
              {busy
                ? <button className="fe-ai-btn ghost" onClick={stop}>停止</button>
                : <button className="fe-ai-btn primary" onClick={() => void send(input, context)}>发送</button>}
            </div>
          </div>
        </>
      )}
    </aside>
  )
}
