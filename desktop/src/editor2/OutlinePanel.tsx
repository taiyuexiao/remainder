/**
 * 大纲（目录）面板 — 设计文档 §4.5
 */
import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { IconCollapseLeft as IIconCollapseLeft } from './icons'

interface Heading { level: number; text: string; pos: number }

export function OutlinePanel({ editor, onCollapse }: { editor: Editor; onCollapse?: () => void }) {
  const [headings, setHeadings] = useState<Heading[]>([])
  const [activePos, setActivePos] = useState<number | null>(null)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    const extract = () => {
      const items: Heading[] = []
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading') items.push({ level: node.attrs.level, text: node.textContent, pos })
      })
      setHeadings((prev) => (JSON.stringify(prev) === JSON.stringify(items) ? prev : items))
      // 当前所在标题
      const { from } = editor.state.selection
      let cur: number | null = null
      for (const h of items) if (h.pos <= from) cur = h.pos
      setActivePos(cur)
    }
    const onTr = () => {
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(extract, 150)
    }
    editor.on('update', onTr)
    editor.on('selectionUpdate', onTr)
    editor.on('transaction', onTr)
    extract()
    return () => {
      editor.off('update', onTr)
      editor.off('selectionUpdate', onTr)
      editor.off('transaction', onTr)
    }
  }, [editor])

  const jump = (h: Heading) => {
    try {
      const dom = editor.view.domAtPos(h.pos + 1)
      const el = dom.node instanceof HTMLElement ? dom.node : dom.node.parentElement
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch {
      editor.chain().focus().setTextSelection(h.pos + 1).scrollIntoView().run()
    }
    setActivePos(h.pos)
  }

  return (
    <aside className="fe-outline">
      <div className="fe-outline-head">
        大纲
        {onCollapse && (
          <button className="fe-outline-collapse" title="收起大纲" onClick={onCollapse}>
            <IIconCollapseLeft size={13} />
          </button>
        )}
      </div>
      <div className="fe-outline-body">
        {headings.length === 0 && <div className="fe-outline-empty">无标题内容</div>}
        {headings.map((h, i) => (
          <div
            key={i}
            className={`fe-outline-item ${activePos === h.pos ? 'on' : ''}`}
            style={{ paddingLeft: 16 + (h.level - 1) * 12, fontSize: h.level <= 2 ? 14 : 13, fontWeight: h.level <= 2 ? 500 : 400 }}
            onClick={() => jump(h)}
            title={h.text}
          >
            {h.text || '无标题'}
          </div>
        ))}
      </div>
    </aside>
  )
}
