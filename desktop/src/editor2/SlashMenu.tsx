/**
 * 斜杠菜单（/ 快速插入）— 对齐飞书：
 * - 触发：行首或空格后输入 /（allow 校验边界），继续输入做模糊过滤（中文/英文/拼音缩写）
 * - 弹层：AI帮我写 特殊置顶条目 + 分组列表（基础/常用/按钮/团队协作），分组标题吸顶
 * - 键盘：↑↓ 选择，Enter/Tab 插入，Esc 删除 /query 并关闭；条目数据见 slashItems.tsx
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Extension, type Editor, type Range } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import Suggestion, { type SuggestionProps, type SuggestionKeyDownProps } from '@tiptap/suggestion'
import { ReactRenderer } from '@tiptap/react'
import { buildSlashItems, filterSlashItems, type SlashItem } from './slashItems'

/* ---------- 弹层列表组件 ---------- */

interface ListHandle {
  onKeyDown: (p: SuggestionKeyDownProps) => boolean
}
interface ListProps {
  items: SlashItem[]
  command: (item: SlashItem) => void
}

export const SlashMenuList = forwardRef<ListHandle, ListProps>((props, ref) => {
  const [sel, setSel] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)

  // eslint-disable-next-line react-hooks/set-state-in-effect -- 过滤结果变化时回位，React 官方认可的 props 调整模式
  useEffect(() => setSel(0), [props.items])
  useEffect(() => {
    boxRef.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowDown') { setSel((s) => (s + 1) % Math.max(props.items.length, 1)); return true }
      if (event.key === 'ArrowUp') { setSel((s) => (s - 1 + props.items.length) % Math.max(props.items.length, 1)); return true }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const item = props.items[sel]
        if (item) props.command(item)
        return true
      }
      return false
    },
  }))

  const groups: Array<[string, SlashItem[]]> = []
  for (const it of props.items) {
    if (it.group === 'AI') continue // AI 特殊置顶，不进分组流
    const last = groups[groups.length - 1]
    if (last && last[0] === it.group) last[1].push(it)
    else groups.push([it.group, [it]])
  }

  let idx = -1
  const ai = props.items.find((it) => it.group === 'AI')
  const aiIndex = ai ? 0 : -1
  if (ai) idx += 1

  return (
    <div className="fe-slash" ref={boxRef}>
      {ai && (
        <div
          className={`fe-slash-item fe-slash-ai${aiIndex === sel ? ' on' : ''}`}
          onMouseEnter={() => setSel(aiIndex)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => props.command(ai)}
        >
          <span className="fe-slash-icon ai"><I_ai /></span>
          <span className="fe-slash-text">
            <span className="t">AI帮我写</span>
            <span className="d">写作 · 续写 · 润色 · 翻译 · 总结</span>
          </span>
        </div>
      )}
      {groups.map(([g, its]) => (
        <div key={g}>
          <div className="fe-slash-group">{g}</div>
          {its.map((it) => {
            idx += 1
            const i = idx
            return (
              <div
                key={it.title}
                className={`fe-slash-item${i === sel ? ' on' : ''}`}
                onMouseEnter={() => setSel(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => props.command(it)}
              >
                <span className="fe-slash-icon">{it.icon}</span>
                <span className="fe-slash-text">
                  <span className="t">{it.title}</span>
                  <span className="d">{it.desc}</span>
                </span>
              </div>
            )
          })}
        </div>
      ))}
      {props.items.length === 0 && <div className="fe-slash-empty">无匹配结果</div>}
    </div>
  )
})
SlashMenuList.displayName = 'SlashMenuList'

/** AI 星光图标（避免循环依赖 icons 命名冲突，就地渲染） */
function I_ai() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M12 2.5l2.1 5.9a2 2 0 001.2 1.2l5.9 2.1-5.9 2.1a2 2 0 00-1.2 1.2L12 20.9l-2.1-5.9a2 2 0 00-1.2-1.2L2.8 11.7l5.9-2.1a2 2 0 001.2-1.2z" />
      <circle cx="19" cy="19.5" r="1.6" />
    </svg>
  )
}

/* ---------- Suggestion 集成 ---------- */

export const SlashMenuExtension = Extension.create({
  name: 'slashMenu',

  addProseMirrorPlugins() {
    const editor = this.editor
    const suggestion = Suggestion({
      editor,
      pluginKey: new PluginKey('feSlashSuggestion'),
      char: '/',
      items: ({ query, editor: ed }: { query: string; editor: Editor }) =>
        filterSlashItems(buildSlashItems(ed), query),
      command: ({ editor: ed, range, props }: { editor: Editor; range: Range; props: SlashItem }) => {
        props.command({ editor: ed, range })
      },
      /** 仅 行首 或 空格后 触发（对齐飞书；避免打断 URL/单词） */
      allow: ({ state, range }) => {
        const $from = state.doc.resolve(range.from)
        const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼')
        return textBefore.length === 0 || /\s$/.test(textBefore)
      },
      render: () => {
        let component: ReactRenderer<ListHandle, ListProps> | null = null
        let popup: HTMLDivElement | null = null

        const position = (clientRect: DOMRect | null) => {
          if (!popup || !clientRect) return
          const W = 348
          popup.style.position = 'fixed'
          popup.style.left = `${Math.min(Math.max(clientRect.left, 8), window.innerWidth - W - 8)}px`
          popup.style.top = `${clientRect.bottom + 8}px`
          requestAnimationFrame(() => {
            if (!popup || !clientRect) return
            const h = popup.offsetHeight
            if (clientRect.bottom + 8 + h > window.innerHeight - 8) {
              popup.style.top = `${Math.max(clientRect.top - 8 - h, 8)}px`
            }
          })
        }

        return {
          onStart: (props: SuggestionProps) => {
            component = new ReactRenderer<ListHandle, ListProps>(SlashMenuList, {
              props: { items: props.items as SlashItem[], command: (item: SlashItem) => props.command(item) },
              editor: props.editor,
            })
            popup = document.createElement('div')
            popup.className = 'fe-slash-popup'
            popup.appendChild(component.element)
            document.body.appendChild(popup)
            if (typeof props.clientRect === 'function') position(props.clientRect())
          },
          onUpdate: (props: SuggestionProps) => {
            component?.updateProps({ items: props.items as SlashItem[], command: (item: SlashItem) => props.command(item) })
            if (typeof props.clientRect === 'function') position(props.clientRect())
          },
          onKeyDown: (props: SuggestionKeyDownProps) => {
            // Esc：删除 /query 文本并关闭菜单（对齐飞书）
            if (props.event.key === 'Escape') {
              const { view, range } = props
              view.dispatch(view.state.tr.delete(range.from, range.to))
              view.focus()
              return true
            }
            return component?.ref?.onKeyDown(props) ?? false
          },
          onExit: () => {
            component?.destroy()
            popup?.remove()
            component = null
            popup = null
          },
        }
      },
    })
    return [suggestion]
  },
})
