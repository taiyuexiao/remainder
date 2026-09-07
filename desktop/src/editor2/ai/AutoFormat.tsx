/**
 * 一键排版（超出飞书原生能力）：
 * 长文写作后，LLM 分析全文结构并给出标题层级方案 → 先预览结构 → 用户确认后
 * 以单个事务应用（⌘Z 可整体撤回）。已有层级的块若合理则保持。
 * 流程：分析中 → 预览（结构树 + 变更统计）→ 应用 / 取消 / 重新分析
 */
import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { streamChat, loadAIConfig, hasAIConfig } from './config'
import { IconClose, IconMagic } from '../icons'

const MAX_BLOCKS = 400
const MAX_TEXT_LEN = 160
const MAX_LEVEL = 3

interface PlanItem { i: number; level: number }

interface DocBlock {
  index: number
  type: string
  level: number
  text: string
  /** 是否可转换（仅段落与标题参与排版，列表/代码块等保持原样） */
  eligible: boolean
}

function collectBlocks(editor: Editor): DocBlock[] {
  const blocks: DocBlock[] = []
  editor.state.doc.forEach((node, offset, index) => {
    const type = node.type.name
    const eligible = type === 'paragraph' || type === 'heading'
    blocks.push({
      index,
      type,
      level: type === 'heading' ? Number(node.attrs.level) || 0 : 0,
      text: node.textContent.slice(0, MAX_TEXT_LEN),
      eligible,
    })
    void offset
  })
  return blocks
}

function buildPrompt(blocks: DocBlock[]): string {
  const typeLabel: Record<string, string> = {
    paragraph: '正文',
    heading: '标题',
    bulletList: '无序列表', orderedList: '有序列表', taskList: '任务',
    blockquote: '引用', codeBlock: '代码块', callout: '高亮块', table: '表格', image: '图片',
  }
  const lines = blocks.map((b) => {
    const t = typeLabel[b.type] ?? b.type
    const lv = b.type === 'heading' ? `L${b.level}` : ''
    return `[${b.index}|${t}${lv}] ${b.text || '(空)'}`
  })
  return [
    '你是文档排版助手。下面是一篇文档的全部顶层块（[编号|当前类型] 内容）。请分析内容结构，为每个【正文和标题】块指定标题层级，帮助读者快速导航：',
    '- level 0 = 正文；level 1/2/3 = 一/二/三级标题',
    '- 文档主题/大章节 → 1；章节小节 → 2；更细分点 → 3；列表项、短条目、普通句子保持正文',
    '- 已经是标题的块，若层级合理保持原级，不合理才调整；注意同级内容同级、下级内容降级',
    `- 非正文/标题的块（列表、代码块等）保持原样，也要输出它们的 level 0`,
    `- 保持块的编号、顺序与数量，不要增删或改写内容`,
    '只输出一个 JSON 数组，格式：[{"i":0,"level":0},{"i":1,"level":1}...]，不要输出任何解释文字。',
    '',
    ...lines.slice(0, MAX_BLOCKS),
  ].join('\n')
}

function parsePlan(raw: string, blockCount: number): PlanItem[] {
  let text = raw.trim().replace(/```(?:json)?/g, '')
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start < 0 || end <= start) throw new Error('模型未返回有效的 JSON 方案')
  text = text.slice(start, end + 1)
  const arr = JSON.parse(text) as Array<{ i?: number; level?: number }>
  if (!Array.isArray(arr)) throw new Error('模型返回格式不正确')
  const plan: PlanItem[] = []
  for (const it of arr) {
    const i = Math.trunc(Number(it?.i))
    let level = Math.trunc(Number(it?.level ?? 0))
    if (!Number.isFinite(i) || i < 0 || i >= blockCount) continue
    if (!Number.isFinite(level)) level = 0
    level = Math.min(Math.max(level, 0), MAX_LEVEL)
    plan.push({ i, level })
  }
  if (!plan.length) throw new Error('模型返回的方案为空')
  return plan
}

const CN = ['', '一级标题', '二级标题', '三级标题']

export function AutoFormatDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [phase, setPhase] = useState<'analyzing' | 'preview' | 'error'>('analyzing')
  const [plan, setPlan] = useState<PlanItem[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [blocks, setBlocks] = useState<DocBlock[]>([])
  const abortRef = useRef<AbortController | null>(null)

  const analyze = async () => {
    const cfg = loadAIConfig()
    if (!hasAIConfig(cfg)) {
      setErrorMsg('尚未配置模型：请通过浮动工具栏「问问AI」或斜杠菜单「AI帮我写」打开右侧 AI 栏，在右上角配置 Base URL / API Key / 模型名后再试。')
      setPhase('error')
      return
    }
    const docBlocks = collectBlocks(editor)
    setBlocks(docBlocks)
    if (!blocks.some((b) => b.eligible && b.text)) {
      setErrorMsg('文档没有可排版的文字内容。')
      setPhase('error')
      return
    }
    setPhase('analyzing')
    setErrorMsg('')
    setElapsed(0)
    const timer = window.setInterval(() => setElapsed((s) => s + 1), 1000)
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      let full = ''
      await streamChat(
        cfg,
        [
          { role: 'system', content: '你是严谨的文档结构分析器，只输出 JSON，不输出任何其他文字。' },
          { role: 'user', content: buildPrompt(docBlocks) },
        ],
        (chunk) => { full += chunk },
        ctrl.signal,
      )
      const parsed = parsePlan(full, blocks.length)
      setPlan(parsed)
      setPhase('preview')
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setErrorMsg((e as Error).message || '分析失败')
      setPhase('error')
    } finally {
      window.clearInterval(timer)
      abortRef.current = null
    }
  }

  useEffect(() => {
    void analyze() // eslint-disable-line react-hooks/set-state-in-effect -- 打开对话框即自动分析
    return () => abortRef.current?.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 应用方案：单个事务内完成全部转换（⌘Z 一次撤回整体） */
  const apply = () => {
    const levelOf = new Map(plan.map((p) => [p.i, p.level]))
    let chain = editor.chain().focus()
    let changed = 0
    blocks.forEach((b) => {
      if (!b.eligible) return
      const target = levelOf.get(b.index)
      if (target == null) return
      if (target === 0 && b.type === 'paragraph') return
      if (target > 0 && b.type === 'heading' && b.level === target) return
      const pos = b.index + 1 // doc 内顶层块的选区位置
      if (target === 0) {
        if (b.type !== 'paragraph') { chain = chain.setNodeSelection(pos).setParagraph(); changed++ }
      } else {
        if (!(b.type === 'heading' && b.level === target)) {
          chain = chain.setNodeSelection(pos).setNode('heading', { level: target })
          changed++
        }
      }
    })
    if (changed > 0) chain.run()
    window.dispatchEvent(new CustomEvent('fe-toast', { detail: `排版完成：调整 ${changed} 处，⌘Z 可整体撤回` }))
    onClose()
  }

  /* ---------- 预览数据 ---------- */
  const headings = plan
    .filter((p) => p.level > 0)
    .map((p) => ({ ...p, text: blocks[p.i]?.text || '' }))
  const changedCount = plan.filter((p) => {
    const b = blocks[p.i]
    if (!b || !b.eligible) return false
    if (p.level === 0) return b.type !== 'paragraph'
    return !(b.type === 'heading' && b.level === p.level)
  }).length
  const truncated = blocks.length > MAX_BLOCKS

  return (
    <div className="fe-autofmt-mask" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="fe-autofmt">
        <div className="fe-autofmt-head">
          <span className="ic"><IconMagic size={15} /></span>
          <span className="t">一键排版 · AI 分析标题层级</span>
          <button className="fe-autofmt-close" title="关闭" onClick={onClose}><IconClose size={14} /></button>
        </div>

        {phase === 'analyzing' && (
          <div className="fe-autofmt-body center">
            <div className="spin" />
            <div className="tip">正在分析全文结构（{elapsed}s）…<br />将输出层级方案供你确认，确认前不会改动文档</div>
          </div>
        )}

        {phase === 'error' && (
          <div className="fe-autofmt-body">
            <div className="fe-ai-error">{errorMsg}</div>
            <div className="fe-autofmt-foot">
              <span className="flex1" />
              <button className="fe-ai-btn ghost" onClick={onClose}>关闭</button>
              <button className="fe-ai-btn primary" onClick={() => void analyze()}>重试</button>
            </div>
          </div>
        )}

        {phase === 'preview' && (
          <div className="fe-autofmt-body">
            <div className="fe-autofmt-summary">
              共 {blocks.length} 块 · 调整 <b>{changedCount}</b> 处层级 ·
              识别出 <b>{headings.length}</b> 个标题
              {truncated && `（超出 ${MAX_BLOCKS} 块的部分未参与分析）`}
              。确认前不会改动文档；应用后可用 ⌘Z 整体撤回。
            </div>
            <div className="fe-autofmt-list">
              {headings.length === 0 && <div className="fe-autofmt-none">模型认为当前文档无需设置标题层级</div>}
              {headings.map((h) => (
                <div key={h.i} className="fe-autofmt-item" style={{ paddingLeft: 12 + (h.level - 1) * 20 }}>
                  <span className="lv">{CN[h.level]}</span>
                  <span className="tx" title={h.text}>{h.text || '(空块)'}</span>
                  <span className="was">{blocks[h.i]?.type === 'heading' ? `原${CN[blocks[h.i].level] || `L${blocks[h.i].level}`}` : '原正文'}</span>
                </div>
              ))}
            </div>
            <div className="fe-autofmt-foot">
              <button className="fe-ai-btn ghost" onClick={() => void analyze()}>重新分析</button>
              <span className="flex1" />
              <button className="fe-ai-btn ghost" onClick={onClose}>取消</button>
              <button className="fe-ai-btn primary" onClick={apply}>应用排版</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
