/**
 * 代码块 v2（对齐飞书）：
 * - 基于 CodeBlockLowlight，语法高亮（hljs class，配色见 global.css 的 .hljs-*）
 * - 顶部：语言下拉（可搜索）｜自动换行开关｜复制
 * - wrap 属性持久化到节点
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { nodeInputRule } from '@tiptap/core'
import { common, createLowlight } from 'lowlight'
import * as I from './icons'

const lowlight = createLowlight(common)

/* ---------- 记住上次选择的语言：新建代码块默认沿用（M33） ---------- */
const CODE_LANG_KEY = 'fe:code-lang'
let lastLang = (() => {
  try { return localStorage.getItem(CODE_LANG_KEY) || '' } catch { return '' }
})()

/** 新建代码块的默认语言：上次手动选择的语言，未选过则纯文本 */
export function defaultCodeLang(): string {
  return lastLang || 'plain text'
}

function rememberLang(lang: string) {
  lastLang = lang
  try { localStorage.setItem(CODE_LANG_KEY, lang) } catch { /* 存储不可用时忽略 */ }
}

// 父级内置 ``` 输入规则的语言字符集太窄（仅 [a-z]+），这里放宽并接入“记住上次语言”（M33）
const backtickInputRegex = /^```([a-zA-Z0-9+#-]*)?[\s\n]$/
const tildeInputRegex = /^~~~([a-zA-Z0-9+#-]*)?[\s\n]$/

export const CODE_LANGUAGES: Array<{ value: string; label: string }> = [
  { value: 'plain text', label: '纯文本' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'jsx', label: 'JSX' },
  { value: 'tsx', label: 'TSX' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'php', label: 'PHP' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'swift', label: 'Swift' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'sql', label: 'SQL' },
  { value: 'bash', label: 'Bash / Shell' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'diff', label: 'Diff' },
]

/** 代码块 NodeView：语言搜索下拉 + 自动换行 + 复制 */
export function CodeBlockView({ node, updateAttributes, selected }: NodeViewProps) {
  const language = (node.attrs.language as string) || 'plain text'
  const wrap = Boolean(node.attrs.wrap)
  const [copied, setCopied] = useState(false)
  const [langOpen, setLangOpen] = useState(false)
  const [query, setQuery] = useState('')
  const langRef = useRef<HTMLDivElement>(null)

  const currentLabel = useMemo(
    () => CODE_LANGUAGES.find((l) => l.value === language)?.label ?? language,
    [language],
  )
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return CODE_LANGUAGES
    return CODE_LANGUAGES.filter((l) => l.label.toLowerCase().includes(q) || l.value.toLowerCase().includes(q))
  }, [query])

  useEffect(() => {
    if (!langOpen) return
    const onDown = (e: MouseEvent) => {
      if (!langRef.current?.contains(e.target as Node)) setLangOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [langOpen])

  const setLang = (v: string) => {
    rememberLang(v)
    updateAttributes({ language: v })
    setLangOpen(false)
  }

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(node.textContent)
    } catch {
      // 剪贴板不可用时忽略
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <NodeViewWrapper className="fe-codeblock" as="div" data-selected={selected ? 'true' : undefined}>
      <div className="fe-codeblock-header" contentEditable={false}>
        <div className="fe-codeblock-lang" ref={langRef}>
          <button type="button" className="fe-codeblock-lang-btn" onMouseDown={(e) => e.stopPropagation()} onClick={() => { setLangOpen((v) => !v); setQuery('') }}>
            {currentLabel}
            <I.IconChevronDown size={11} />
          </button>
          {langOpen && (
            <div className="fe-codeblock-lang-panel">
              <input
                autoFocus
                placeholder="搜索语言"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && filtered[0]) {
                    setLang(filtered[0].value)
                  }
                  if (e.key === 'Escape') setLangOpen(false)
                  e.stopPropagation()
                }}
              />
              <div className="fe-codeblock-lang-list">
                {filtered.map((l) => (
                  <div
                    key={l.value}
                    className={`fe-codeblock-lang-item ${l.value === language ? 'on' : ''}`}
                    onClick={() => setLang(l.value)}
                  >
                    {l.label}
                  </div>
                ))}
                {filtered.length === 0 && <div className="fe-codeblock-lang-empty">无匹配语言</div>}
              </div>
            </div>
          )}
        </div>
        <span className="flex1" />
        <button
          type="button"
          className={`fe-codeblock-icon-btn ${wrap ? 'on' : ''}`}
          title={wrap ? '取消自动换行' : '自动换行'}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => updateAttributes({ wrap: !wrap })}
        >
          <I.IconWrap size={14} />
        </button>
        <button type="button" className="fe-codeblock-copy" onMouseDown={(e) => e.preventDefault()} onClick={onCopy}>
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <NodeViewContent className={`fe-codeblock-content ${wrap ? 'wrap' : ''}`} as="pre" />
    </NodeViewWrapper>
  )
}

/**
 * 代码块 Node：CodeBlockLowlight（保留 ``` 输入规则与快捷键），语言默认纯文本，
 * 增加可持久化的 wrap 属性并接入自定义 NodeView
 */
export const FeCodeBlock = CodeBlockLowlight.extend({
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      // 对齐飞书：行首输入 ```lang 后按回车直接创建代码块
      Enter: ({ editor }) => {
        const { $from } = editor.state.selection
        if ($from.parent.type.name !== 'paragraph') return false
        const m = /^```([a-zA-Z0-9+#-]*)$/.exec($from.parent.textContent)
        if (!m) return false
        const lang = m[1] || defaultCodeLang()
        editor.chain().setNode('codeBlock', { language: lang }).run()
        return true
      },
    }
  },

  addInputRules() {
    const attrs = (m: RegExpMatchArray) => {
      const lang = m[1] || defaultCodeLang()
      if (m[1]) rememberLang(m[1]) // 显式 ```lang 也计入“上次语言”
      return { language: lang }
    }
    return [
      nodeInputRule({ find: backtickInputRegex, type: this.type, getAttributes: attrs }),
      nodeInputRule({ find: tildeInputRegex, type: this.type, getAttributes: attrs }),
    ]
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      language: {
        default: 'plain text',
        parseHTML: (el) => el.getAttribute('data-language') || 'plain text',
        renderHTML: (attrs) => ({ 'data-language': attrs.language }),
      },
      wrap: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-wrap') === 'true',
        renderHTML: (attrs) => (attrs.wrap ? { 'data-wrap': 'true' } : {}),
      },
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView)
  },
}).configure({ lowlight })
