/**
 * 「AI帮我写」配置（M29 改造）：不再页面直连 OpenAI，统一走 remainder server 代理
 * （POST /api/llm/chat-stream → DeepSeek，API key 只在 server 侧）。
 * AIConfig 接口保留以兼容 AISidebar 的设置面板（保存无效，仅作占位）。
 */
import { API_BASE } from '../../api/client'

export interface AIConfig {
  baseURL: string
  apiKey: string
  model: string
  temperature: number
}

const KEY = 'feishu-clone:ai-config'

export const DEFAULT_AI_CONFIG: AIConfig = {
  baseURL: 'server-proxy',
  apiKey: 'server-proxy',
  model: 'server-proxy',
  temperature: 0.7,
}

export function loadAIConfig(): AIConfig {
  return { ...DEFAULT_AI_CONFIG }
}

export function saveAIConfig(_cfg: AIConfig) {
  // 配置由 server 侧管理（设置页），此处不再落 localStorage
}

export function hasAIConfig(_cfg: AIConfig): boolean {
  return true
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * 流式调用 OpenAI 兼容 /chat/completions。
 * onDelta 逐段回调增量文本；返回完整文本。abort 用于停止生成。
 */
export async function streamChat(
  cfg: AIConfig,
  messages: ChatMessage[],
  onDelta: (chunk: string) => void,
  abort: AbortSignal,
): Promise<string> {
  const url = `${API_BASE}/api/llm/chat-stream`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = localStorage.getItem('team-token')
  if (token) headers['x-team-token'] = token
  const user = localStorage.getItem('user-name')?.trim()
  if (user) headers['x-user-name'] = encodeURIComponent(user)
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ messages }),
    signal: abort,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`请求失败 ${res.status}：${text.slice(0, 300) || res.statusText}`)
  }
  if (!res.body) throw new Error('当前环境不支持流式响应')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const t = line.trim()
      if (!t.startsWith('data:')) continue
      const data = t.slice(5).trim()
      if (data === '[DONE]') continue
      try {
        const json = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>
        }
        const chunk = json.choices?.[0]?.delta?.content
        if (chunk) {
          full += chunk
          onDelta(chunk)
        }
      } catch {
        /* 忽略无法解析的心跳/注释行 */
      }
    }
  }
  return full
}
