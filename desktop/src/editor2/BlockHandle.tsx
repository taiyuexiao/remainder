/**
 * 块把手 v3（对齐飞书最新版）：
 * - 悬停任意行，行首直接浮现按钮对：
 *   · 内容行 → [T 文本样式][⋮⋮ 六点把手]：点击 T 打开文本样式菜单；点击 ⋮⋮ 打开
 *     操作菜单（剪切/复制/上移/下移/删除）；按住 ⋮⋮ 拖拽移动块（蓝色指示线）
 *   · 空白行 → [+ 插入][T 文本样式]
 * - 所见即点，无需二次悬停展开
 */
import React, { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { SlashMenuList } from './SlashMenu'
import { buildSlashItems, type SlashItem } from './slashItems'
import { TextStyleMenu } from './TextStyleMenu'
import { getTopBlockAt, duplicateTopBlock, cutTopBlock, deleteTopBlock, moveTopBlock } from './blockOps'
import { IconPlus, IconDrag } from './icons'

interface HoverInfo {
  index: number
  pos: number
  top: number
  left: number
  isEmpty: boolean
}

interface DragState {
  fromIndex: number
  targetIndex: number
  active: boolean
  indicatorY: number | null
}

export function BlockHandle({ editor, editable }: { editor: Editor; editable: boolean }) {
  const [hover, setHover] = useState<HoverInfo | null>(null)
  const [tOpen, setTOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [insertOpen, setInsertOpen] = useState(false)
  const [drag, setDrag] = useState<DragState | null>(null)

  const handleRef = useRef<HTMLDivElement>(null)
  const tRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLDivElement>(null)
  const insertRef = useRef<HTMLDivElement>(null)
  const hoverIndexRef = useRef<number>(-1)
  const dragMovedRef = useRef(false)

  /* ---------- 悬停跟踪：定位顶层块 ---------- */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- editable 关闭时清把手，属合法的状态重置
    if (!editable) { setHover(null); return }
    const editorDom = editor.view.dom as HTMLElement
    let raf = 0

    const locate = (e: MouseEvent) => {
      const t = e.target as Node
      const inEditor = editorDom.contains(t)
      const inFloat = [handleRef, tRef, moreRef, insertRef].some((r) => r.current?.contains(t))
      if (!inEditor && !inFloat) { setHover(null); return }
      if (!inEditor) return

      const children = Array.from(editorDom.children) as HTMLElement[]
      let found = -1
      for (let i = 0; i < children.length; i++) {
        const r = children[i].getBoundingClientRect()
        if (r.height > 0 && e.clientY >= r.top - 2 && e.clientY <= r.bottom + 2) { found = i; break }
      }
      if (found < 0) { setHover(null); return }

      const info = getTopBlockAt(editor, found)
      if (!info) return
      const r = children[found].getBoundingClientRect()
      const contentRect = editorDom.getBoundingClientRect()
      const isEmpty = info.node.type.name === 'paragraph' && info.node.content.size === 0
      setHover((prev) =>
        prev && prev.index === found && Math.abs(prev.top - r.top) < 1
          ? prev
          : { index: found, pos: info.pos, top: r.top, left: contentRect.left, isEmpty },
      )
      // 换行时收起已打开的菜单
      if (found !== hoverIndexRef.current) {
        hoverIndexRef.current = found
        setTOpen(false)
        setMoreOpen(false)
      }
    }

    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => locate(e))
    }
    const onHide = () => { setHover(null); hoverIndexRef.current = -1 }
    document.addEventListener('mousemove', onMove)
    window.addEventListener('scroll', onHide, true)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('mousemove', onMove)
      window.removeEventListener('scroll', onHide, true)
    }
  }, [editor, editable])

  /* ---------- 点击外部 / Esc 关闭浮层 ---------- */
  useEffect(() => {
    if (!tOpen && !moreOpen && !insertOpen) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      const inside = [handleRef, tRef, moreRef, insertRef].some((r) => r.current?.contains(t))
      if (!inside) { setTOpen(false); setMoreOpen(false); setInsertOpen(false) }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setTOpen(false); setMoreOpen(false); setInsertOpen(false) }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [tOpen, moreOpen, insertOpen])

  if (!editable) return null
  if (!hover && !drag && !insertOpen) return null

  /* ---------- 动作 ---------- */
  const selectBlock = () => {
    if (!hover) return
    const info = getTopBlockAt(editor, hover.index)
    if (info) editor.commands.setTextSelection(Math.min(info.pos + 1, editor.state.doc.content.size))
  }

  const openInsertOnEmpty = () => {
    if (!hover) return
    editor.chain().focus().setTextSelection(hover.pos + 1).run()
    setInsertOpen(true)
  }

  /** 「在下方添加」：当前块下方插入空段并打开插入菜单 */
  const addBelow = () => {
    if (!hover) return
    const info = getTopBlockAt(editor, hover.index)
    if (!info) return
    editor
      .chain()
      .focus()
      .insertContentAt(info.pos + info.size, { type: 'paragraph' })
      .setTextSelection(info.pos + info.size + 1)
      .run()
    setTOpen(false); setMoreOpen(false)
    setInsertOpen(true)
  }

  const insertItems: SlashItem[] = buildSlashItems(editor).filter(
    (it) => it.group === '基础' || it.group === '常用',
  )

  const execInsert = (it: SlashItem) => {
    setInsertOpen(false)
    it.command({ editor })
  }

  /* ---------- 拖拽移动 ---------- */
  const startDrag = (e: React.MouseEvent) => {
    if (!hover) return
    e.preventDefault()
    e.stopPropagation()
    const fromIndex = hover.index
    const editorDom = editor.view.dom as HTMLElement
    dragMovedRef.current = false

    const computeTarget = (clientY: number) => {
      const children = Array.from(editorDom.children) as HTMLElement[]
      let target = children.length
      let y = children.length
        ? children[children.length - 1].getBoundingClientRect().bottom
        : clientY
      for (let i = 0; i < children.length; i++) {
        const r = children[i].getBoundingClientRect()
        if (clientY < r.top + r.height / 2) { target = i; y = r.top; break }
      }
      return { target, y }
    }

    const { target, y } = computeTarget(e.clientY)
    setDrag({ fromIndex, targetIndex: target, active: false, indicatorY: y })

    const onMove = (ev: MouseEvent) => {
      dragMovedRef.current = true
      const t = computeTarget(ev.clientY)
      setDrag({ fromIndex, targetIndex: t.target, active: true, indicatorY: t.y })
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      setDrag((d) => {
        if (d?.active && d.targetIndex !== d.fromIndex && d.targetIndex !== d.fromIndex + 1) {
          performMove(d.fromIndex, d.targetIndex)
        }
        return null
      })
      // 注意：不清 hover，否则组件在 click 派发前卸载，⋮⋮ 的单击菜单会被吞掉
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const performMove = (from: number, boundary: number) => {
    const info = getTopBlockAt(editor, from)
    if (!info) return
    const json = info.node.toJSON()
    let insertPos: number | null = null
    if (boundary < from) {
      const t = getTopBlockAt(editor, boundary)
      if (t) insertPos = t.pos
    } else if (boundary > from + 1) {
      const t = getTopBlockAt(editor, boundary - 1)
      if (t) insertPos = t.pos + t.size
    }
    if (insertPos == null) return
    editor.chain().focus().deleteRange({ from: info.pos, to: info.pos + info.size }).run()
    const adjusted = insertPos > info.pos ? insertPos - info.size : insertPos
    editor.chain().focus().insertContentAt(adjusted, json).run()
  }

  /* ---------- ⋮⋮ 操作菜单 ---------- */
  const moreActions = [
    { label: '剪切', onClick: () => hover && cutTopBlock(editor, hover.index) },
    { label: '复制', onClick: () => hover && duplicateTopBlock(editor, hover.index) },
    { label: '上移', onClick: () => hover && moveTopBlock(editor, hover.index, -1) },
    { label: '下移', onClick: () => hover && moveTopBlock(editor, hover.index, 1) },
    { label: '删除', danger: true, onClick: () => hover && deleteTopBlock(editor, hover.index) },
  ]

  const handleTop = drag?.active ? Math.min(hover?.top ?? 0, drag.indicatorY ?? 0) : hover?.top ?? 0
  const handleLeft = hover?.left ?? 0
  const menuLeft = Math.min(handleLeft + 44, window.innerWidth - 236)
  const menuTop = Math.min(handleTop + 28, window.innerHeight - 420)

  return (
    <>
      {hover && (
        <div
          ref={handleRef}
          className="fe-block-handle"
          style={{ top: handleTop, left: handleLeft - 58 }}
          contentEditable={false}
        >
          {hover.isEmpty && (
            <button
              className="fe-bh-btn"
              title="插入内容"
              onMouseDown={(e) => e.preventDefault()}
              onClick={openInsertOnEmpty}
            >
              <IconPlus size={17} />
            </button>
          )}
          <button
            className="fe-bh-btn fe-bh-t"
            title="文本样式：转换为标题/列表/引用等"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setMoreOpen(false); setTOpen((v) => !v) }}
          >
            T
          </button>
          <button
            className="fe-bh-btn fe-bh-drag"
            title="点击打开块操作菜单 · 按住拖拽移动"
            onMouseDown={startDrag}
            onClick={() => {
              if (dragMovedRef.current) { dragMovedRef.current = false; return }
              setTOpen(false)
              setMoreOpen((v) => !v)
            }}
          >
            <IconDrag size={17} />
          </button>
        </div>
      )}

      {/* T 文本样式菜单 */}
      {tOpen && hover && (
        <div
          ref={tRef}
          className="fe-pop fe-tstyle-pop"
          style={{ left: menuLeft, top: menuTop }}
          contentEditable={false}
        >
          <TextStyleMenu
            editor={editor}
            withLayout
            prepare={selectBlock}
            onPick={() => { setTOpen(false) }}
          />
          <div className="fe-menu-sep" />
          <div className="fe-mi" onClick={addBelow}>
            <span className="fe-mi-ic"><IconPlus size={14} /></span>
            <span className="fe-mi-t">在下方添加</span>
          </div>
        </div>
      )}

      {/* ⋮⋮ 操作菜单 */}
      {moreOpen && hover && (
        <div
          ref={moreRef}
          className="fe-pop"
          style={{ left: menuLeft, top: menuTop, width: 176 }}
          contentEditable={false}
        >
          {moreActions.map((a) => (
            <div
              key={a.label}
              className={`fe-mi ${a.danger ? 'danger' : ''}`}
              onClick={() => { a.onClick(); setMoreOpen(false) }}
            >
              <span className="fe-mi-t">{a.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* 插入菜单（+ / 在下方添加） */}
      {insertOpen && (
        <div
          ref={insertRef}
          className="fe-slash-popup"
          style={{
            left: Math.min(Math.max(handleLeft + 24, 8), window.innerWidth - 356),
            top: Math.min(handleTop + 24, window.innerHeight - 380),
          }}
          contentEditable={false}
        >
          <SlashMenuList items={insertItems} command={execInsert} />
        </div>
      )}

      {/* 拖拽蓝色指示线 */}
      {drag?.active && drag.indicatorY != null && (
        <div className="fe-drag-indicator" style={{ top: drag.indicatorY, left: handleLeft, width: `calc(100% - ${handleLeft + 8}px)` }} />
      )}
    </>
  )
}
