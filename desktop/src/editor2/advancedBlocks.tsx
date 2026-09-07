/**
 * P1 真实内容块：
 * - formula 块级公式 / inlineFormula 行内公式（KaTeX 渲染，双击编辑，$...$ 快捷输入）
 * - grid 分栏（两栏/三栏/左窄右宽/左宽右窄，栏内可放任意块，顶部条切换布局）
 * - mention 人员（输入 @ 唤起成员选择，模拟成员列表）
 * - dateChip 日期提醒（行内日期胶囊，点击改日期/移除）
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Node, Extension, mergeAttributes, InputRule, type CommandProps } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import {
  NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer, ReactRenderer,
  type NodeViewProps,
} from '@tiptap/react'
import Suggestion, { type SuggestionKeyDownProps } from '@tiptap/suggestion'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import * as I from './icons'

/* ================= 公式 ================= */

function renderKatex(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex || '\\;', { displayMode, throwOnError: false })
  } catch {
    return '<span class="fe-formula-error">公式错误</span>'
  }
}

function FormulaEditor({ value, onSave, onCancel, block }: {
  value: string
  onSave: (latex: string) => void
  /** 取消时带回当前输入，供父级判断是否删除空节点 */
  onCancel: (currentText: string) => void
  block: boolean
}) {
  const [text, setText] = useState(value)
  return (
    <div className="fe-formula-editor" contentEditable={false} onClick={(e) => e.stopPropagation()}>
      <textarea
        autoFocus
        value={text}
        placeholder={block ? '输入 LaTeX 公式，如 \\frac{a}{b}' : '输入 LaTeX，如 x^2'}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSave(text) }
          if (e.key === 'Escape') { e.preventDefault(); onCancel(text) }
          e.stopPropagation()
        }}
      />
      <div className="fe-formula-preview" dangerouslySetInnerHTML={{ __html: renderKatex(text, block) }} />
      <div className="fe-formula-actions">
        <button className="fe-ai-btn ghost" onClick={() => onCancel(text)}>取消</button>
        <button className="fe-ai-btn primary" onClick={() => onSave(text)}>完成</button>
      </div>
    </div>
  )
}

function FormulaBlockView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const [editing, setEditing] = useState(!(node.attrs.latex as string))
  const latex = (node.attrs.latex as string) || ''
  return (
    <NodeViewWrapper className="fe-formula-block" data-selected={selected ? 'true' : undefined}>
      <div className="fe-formula-render" contentEditable={false} onDoubleClick={() => setEditing(true)}>
        <div dangerouslySetInnerHTML={{ __html: renderKatex(latex, true) }} />
        <span className="fe-formula-hint">双击编辑</span>
      </div>
      {editing && (
        <FormulaEditor
          block
          value={latex}
          onSave={(v) => { if (v.trim()) updateAttributes({ latex: v }); setEditing(false) }}
          onCancel={(t) => { setEditing(false); if (!t.trim() && !latex.trim()) deleteNode() }}
        />
      )}
    </NodeViewWrapper>
  )
}

function InlineFormulaView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const [editing, setEditing] = useState(false)
  const latex = (node.attrs.latex as string) || ''
  return (
    <NodeViewWrapper
      as="span"
      className={`fe-formula-inline ${selected ? 'sel' : ''}`}
      contentEditable={false}
      onDoubleClick={() => setEditing(true)}
    >
      <span className="inner" dangerouslySetInnerHTML={{ __html: renderKatex(latex || '\\;', false) }} />
      {editing && (
        <FormulaEditor
          block={false}
          value={latex}
          onSave={(v) => { if (v.trim()) updateAttributes({ latex: v }); setEditing(false) }}
          onCancel={(t) => { setEditing(false); if (!t.trim() && !latex.trim()) deleteNode() }}
        />
      )}
    </NodeViewWrapper>
  )
}

export const Formula = Node.create({
  name: 'formula',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes() {
    return { latex: { default: '', parseHTML: (el) => el.getAttribute('data-latex') || '', renderHTML: (a) => ({ 'data-latex': a.latex }) } }
  },
  parseHTML() { return [{ tag: 'div[data-type="formula"]' }] },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'formula' })] },
  addNodeView() { return ReactNodeViewRenderer(FormulaBlockView) },
  addCommands() {
    return {
      insertFormula: () => ({ chain }: CommandProps) =>
        chain().focus().insertContent({ type: 'formula', attrs: { latex: '' } }).run(),
    }
  },
})

export const InlineFormula = Node.create({
  name: 'inlineFormula',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return { latex: { default: '', parseHTML: (el) => el.getAttribute('data-latex') || '', renderHTML: (a) => ({ 'data-latex': a.latex }) } }
  },
  parseHTML() { return [{ tag: 'span[data-type="inline-formula"]' }] },
  renderHTML({ HTMLAttributes }) { return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'inline-formula' })] },
  addNodeView() { return ReactNodeViewRenderer(InlineFormulaView) },
  addInputRules() {
    return [
      new InputRule({
        find: /\$([^$\n]+)\$$/,
        handler: ({ state, range, match }) => {
          const latex = (match[1] ?? '').trim()
          if (!latex) return null
          state.tr.delete(range.from, range.to)
          state.tr.insert(range.from, this.type.create({ latex }))
          return undefined
        },
      }),
    ]
  },
})

/* ================= 分栏 ================= */

export const GRID_LAYOUTS = [
  { key: '2', label: '两栏', cols: 2 },
  { key: '3', label: '三栏', cols: 3 },
  { key: '1-2', label: '左窄右宽', cols: 2 },
  { key: '2-1', label: '左宽右窄', cols: 2 },
] as const

const EMPTY_COL = { type: 'grid_column', content: [{ type: 'paragraph' }] }

function GridView({ node, editor, getPos, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const [barOpen, setBarOpen] = useState(false)
  const layout = (node.attrs.layout as string) || '2'
  const colCount = node.content.childCount
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!barOpen) return
    const onDown = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as HTMLElement)) setBarOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [barOpen])

  /** 切换布局：更新 layout 并增删列（保留既有列内容，从末尾增删） */
  const applyLayout = (key: string) => {
    const target = GRID_LAYOUTS.find((l) => l.key === key)
    const n = target?.cols ?? 2
    updateAttributes({ layout: key })
    const diff = n - colCount
    if (diff === 0) return
    const start = getPos() + 1
    if (diff > 0) {
      editor.chain().insertContentAt(start + node.content.size, Array.from({ length: diff }, () => EMPTY_COL)).run()
    } else {
      // 从末尾删除 |diff| 列
      let cutStart = start + node.content.size
      for (let i = 0; i < -diff; i++) {
        const child = node.content.child(colCount - 1 - i)
        cutStart -= child.nodeSize
      }
      editor.chain().deleteRange({ from: cutStart, to: start + node.content.size }).run()
    }
  }

  return (
    <NodeViewWrapper className="fe-grid-wrap" data-selected={selected ? 'true' : undefined}>
      <div className="fe-grid-bar" contentEditable={false}>
        <button type="button" className="fe-grid-bar-btn" onClick={() => setBarOpen((v) => !v)}>
          分栏 · {GRID_LAYOUTS.find((l) => l.key === layout)?.label}
          <I.IconChevronDown size={11} />
        </button>
        {barOpen && (
          <div className="fe-grid-bar-panel" ref={panelRef}>
            {GRID_LAYOUTS.map((l) => (
              <div key={l.key} className={`fe-mi ${l.key === layout ? 'on' : ''}`} onClick={() => { setBarOpen(false); applyLayout(l.key) }}>
                {l.label}
              </div>
            ))}
            <div className="fe-menu-sep" />
            <div className="fe-mi danger" onClick={() => deleteNode()}>删除分栏</div>
          </div>
        )}
      </div>
      <NodeViewContent className={`fe-grid layout-${layout}`} />
    </NodeViewWrapper>
  )
}

export const Grid = Node.create({
  name: 'grid',
  group: 'block',
  content: 'grid_column+',
  defining: true,
  isolating: true,
  addAttributes() {
    return { layout: { default: '2', parseHTML: (el) => el.getAttribute('data-layout') || '2', renderHTML: (a) => ({ 'data-layout': a.layout }) } }
  },
  parseHTML() { return [{ tag: 'div[data-type="grid"]' }] },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'grid' }), 0] },
  addNodeView() { return ReactNodeViewRenderer(GridView) },
})

export const GridColumn = Node.create({
  name: 'grid_column',
  content: 'block+',
  defining: true,
  parseHTML() { return [{ tag: 'div[data-type="grid-column"]' }] },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'grid-column' }), 0] },
})

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    grid: {
      insertGrid: (layout?: string) => ReturnType
    }
    formula: {
      insertFormula: () => ReturnType
    }
  }
}

export function insertGridContent(editor: import('@tiptap/core').Editor, layout = '2') {
  const cols = GRID_LAYOUTS.find((l) => l.key === layout)?.cols ?? 2
  editor.chain().focus()
    .insertContent({ type: 'grid', attrs: { layout }, content: Array.from({ length: cols }, () => EMPTY_COL) })
    .run()
}

/* ================= @提及人员 ================= */

export const USERS = [
  { id: 'u1', name: '张伟', color: '#3370FF' },
  { id: 'u2', name: '李娜', color: '#FF8800' },
  { id: 'u3', name: '王芳', color: '#34A853' },
  { id: 'u4', name: '刘洋', color: '#7F3BF5' },
  { id: 'u5', name: '陈晨', color: '#F5319D' },
  { id: 'u6', name: '我', color: '#3370FF' },
]

export const Mention = Node.create({
  name: 'mention',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return {
      id: { default: null, parseHTML: (el) => el.getAttribute('data-id'), renderHTML: (a) => ({ 'data-id': a.id }) },
      label: { default: '', parseHTML: (el) => el.getAttribute('data-label') || '', renderHTML: (a) => ({ 'data-label': a.label }) },
      color: { default: '#3370FF', parseHTML: (el) => el.getAttribute('data-color') || '#3370FF', renderHTML: (a) => ({ 'data-color': a.color }) },
    }
  },
  parseHTML() { return [{ tag: 'span[data-type="mention"]' }] },
  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'mention', style: `color:${node.attrs.color}` }), `@${node.attrs.label}`]
  },
})

/* ================= 日期提醒 ================= */

export function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function DateChipView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const [editing, setEditing] = useState(false)
  const date = (node.attrs.date as string) || todayStr()
  const overdue = useMemo(() => new Date(date).getTime() < new Date(todayStr()).getTime(), [date])
  return (
    <NodeViewWrapper as="span" className={`fe-date-chip ${overdue ? 'overdue' : ''} ${selected ? 'sel' : ''}`}>
      <span className="inner" contentEditable={false} onClick={() => setEditing(true)}>
        <I.IconBell size={12} />
        <span>{date}</span>
      </span>
      {editing && (
        <span className="fe-date-picker" contentEditable={false}>
          <input
            type="date"
            autoFocus
            value={date}
            onChange={(e) => { if (e.target.value) updateAttributes({ date: e.target.value }) }}
            onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') setEditing(false) }}
          />
          <button title="移除" onClick={() => deleteNode()}><I.IconTrash size={12} /></button>
          <button title="完成" onClick={() => setEditing(false)}><I.IconCheck size={12} /></button>
        </span>
      )}
    </NodeViewWrapper>
  )
}

export const DateChip = Node.create({
  name: 'dateChip',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return { date: { default: todayStr(), parseHTML: (el) => el.getAttribute('data-date') || todayStr(), renderHTML: (a) => ({ 'data-date': a.date }) } }
  },
  parseHTML() { return [{ tag: 'span[data-type="date-chip"]' }] },
  renderHTML({ HTMLAttributes }) { return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'date-chip' })] },
  addNodeView() { return ReactNodeViewRenderer(DateChipView) },
})

/* ================= 输入 @ 唤起成员选择 ================= */

interface UserListHandle {
  onKeyDown: (p: SuggestionKeyDownProps) => boolean
}

const UserList = (props: { items: typeof USERS; command: (u: (typeof USERS)[number]) => void }, ref: React.Ref<UserListHandle>) => {
  void ref
  return (
    <div className="fe-user-list">
      {props.items.map((u) => (
        <div key={u.id} className="fe-user-item" onMouseDown={(e) => e.preventDefault()} onClick={() => props.command(u)}>
          <span className="fe-user-avatar" style={{ background: u.color }}>{u.name.slice(0, 1)}</span>
          {u.name}
        </div>
      ))}
      {props.items.length === 0 && <div className="fe-user-item empty">无匹配成员</div>}
    </div>
  )
}

export const MentionSuggestion = Extension.create({
  name: 'mentionSuggestion',
  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      Suggestion({
        editor,
        pluginKey: new PluginKey('feMentionSuggestion'),
        char: '@',
        allowSpaces: false,
        items: ({ query }) => {
          const q = query.trim().toLowerCase()
          return USERS.filter((u) => u.name.toLowerCase().includes(q))
        },
        command: ({ editor: ed, range, props: user }) => {
          ed.chain().focus()
            .deleteRange(range)
            .insertContent({ type: 'mention', attrs: { id: user.id, label: user.name, color: user.color } })
            .insertContent({ type: 'text', text: ' ' })
            .run()
        },
        render: () => {
          let popup: HTMLDivElement | null = null
          let component: ReactRenderer<unknown, { items: typeof USERS; command: (u: (typeof USERS)[number]) => void }> | null = null
          const position = (clientRect: DOMRect | null) => {
            if (!popup || !clientRect) return
            popup.style.left = `${Math.min(clientRect.left, window.innerWidth - 224)}px`
            popup.style.top = `${clientRect.bottom + 6}px`
          }
          return {
            onStart: (p) => {
              component = new ReactRenderer(UserList as unknown as (props: { items: typeof USERS; command: (u: (typeof USERS)[number]) => void }) => JSX.Element, {
                props: { items: p.items as typeof USERS, command: (u: (typeof USERS)[number]) => p.command(u) },
                editor: p.editor,
              })
              popup = document.createElement('div')
              popup.className = 'fe-user-popup'
              popup.appendChild(component.element)
              document.body.appendChild(popup)
              if (typeof p.clientRect === 'function') position(p.clientRect())
            },
            onUpdate: (p) => {
              component?.updateProps({ items: p.items as typeof USERS, command: (u: (typeof USERS)[number]) => p.command(u) })
              if (typeof p.clientRect === 'function') position(p.clientRect())
            },
            onKeyDown: (p: SuggestionKeyDownProps) => p.event.key === 'Escape',
            onExit: () => {
              component?.destroy()
              popup?.remove()
              popup = null
              component = null
            },
          }
        },
      }),
    ]
  },
})

/* ================= 光标处选人浮层（斜杠菜单「人员」入口） ================= */

export function openUserPicker(editor: import('@tiptap/core').Editor) {
  const { from } = editor.state.selection
  let coords: { left: number; top: number; bottom: number }
  try {
    coords = editor.view.coordsAtPos(from)
  } catch {
    return
  }
  const popup = document.createElement('div')
  popup.className = 'fe-user-popup fe-user-picker'
  popup.style.left = `${Math.min(coords.left, window.innerWidth - 230)}px`
  popup.style.top = `${coords.bottom + 6}px`

  const render = (query: string) => {
    popup.innerHTML = ''
    const input = document.createElement('input')
    input.className = 'fe-user-search'
    input.placeholder = '搜索成员'
    input.value = query
    input.oninput = () => render(input.value)
    input.onkeydown = (e) => {
      if (e.key === 'Escape') popup.remove()
      e.stopPropagation()
    }
    popup.appendChild(input)
    const list = document.createElement('div')
    list.className = 'fe-user-list'
    const q = query.trim().toLowerCase()
    USERS.filter((u) => u.name.toLowerCase().includes(q)).forEach((u) => {
      const item = document.createElement('div')
      item.className = 'fe-user-item'
      item.innerHTML = `<span class="fe-user-avatar" style="background:${u.color}">${u.name.slice(0, 1)}</span>${u.name}`
      item.onmousedown = (e) => e.preventDefault()
      item.onclick = () => {
        editor.chain().focus().insertContent({ type: 'mention', attrs: { id: u.id, label: u.name, color: u.color } }).insertContent({ type: 'text', text: ' ' }).run()
        popup.remove()
      }
      list.appendChild(item)
    })
    popup.appendChild(list)
    input.focus()
  }
  render('')
  const onDown = (e: MouseEvent) => {
    if (!popup.contains(e.target as HTMLElement)) popup.remove()
  }
  setTimeout(() => document.addEventListener('mousedown', onDown), 0)
  document.body.appendChild(popup)
}
