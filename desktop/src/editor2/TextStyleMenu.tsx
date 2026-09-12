/**
 * T 文本样式菜单（对齐飞书官方条目）：
 * 正文 / 一级~三级标题 / 其他标题(子菜单) / 有序列表 / 无序列表 / 任务 / 代码块 / 引用 / 高亮块 / 同步块
 * - 「其他标题」收录未被渐进规则直接展示的级别（N+1..9）
 * - 同时提供 缩进增减 与 对齐 设置（⋮⋮ 工具栏场景展开在同一面板）
 * prepare：由使用方在执行命令前把选区定位到目标块（块把手场景）
 */
import { useState } from 'react'
import type { Editor } from '@tiptap/core'
import { getVisibleHeadingLevels, getNestedHeadingLevels } from './headingLevels'
import * as I from './icons'
import { insertMockBlock } from './mockBlocks'
import { defaultCodeLang } from './CodeBlockView'

const CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九']

export function TextStyleMenu({ editor, prepare, onPick, withLayout }: {
  editor: Editor
  /** 执行命令前的选区准备（块把手场景定位到目标块） */
  prepare?: () => void
  onPick?: () => void
  /** 是否附加 缩进/对齐/在下方添加 分区（块把手场景） */
  withLayout?: boolean
}) {
  const [nestedOpen, setNestedOpen] = useState(false)
  const doc = editor.state.doc
  const visible = getVisibleHeadingLevels(doc)
  const nested = getNestedHeadingLevels(doc)

  const run = (fn: () => void) => {
    prepare?.()
    fn()
    onPick?.()
  }

  const headingRow = (level: number) => ({
    key: `h${level}`,
    icon: <I.IconHeading level={level} />,
    label: `${CN[level - 1]}级标题`,
    active: editor.isActive('heading', { level }),
    onClick: () => run(() => editor.chain().focus().setNode('heading', { level }).run()),
  })

  const rows = [
    {
      key: 'text',
      icon: <I.IconTextT size={15} />,
      label: '正文',
      active: !editor.isActive('heading') && !editor.isActive('codeBlock') && !editor.isActive('blockquote') && !editor.isActive('taskList') && !editor.isActive('bulletList') && !editor.isActive('orderedList') && !editor.isActive('callout'),
      onClick: () => run(() => editor.chain().focus().setParagraph().run()),
    },
    ...visible.map(headingRow),
  ]

  const mainRows = [
    { key: 'ol', icon: <I.IconOrderedList size={15} />, label: '有序列表', active: editor.isActive('orderedList'), onClick: () => run(() => editor.chain().focus().toggleOrderedList().run()) },
    { key: 'ul', icon: <I.IconBulletList size={15} />, label: '无序列表', active: editor.isActive('bulletList'), onClick: () => run(() => editor.chain().focus().toggleBulletList().run()) },
    { key: 'task', icon: <I.IconTodoList size={15} />, label: '任务', active: editor.isActive('taskList'), onClick: () => run(() => editor.chain().focus().toggleTaskList().run()) },
    { key: 'code', icon: <I.IconCodeBlock size={15} />, label: '代码块', active: editor.isActive('codeBlock'), onClick: () => run(() => editor.chain().focus().toggleCodeBlock({ language: defaultCodeLang() }).run()) },
    { key: 'quote', icon: <I.IconQuote size={15} />, label: '引用', active: editor.isActive('blockquote'), onClick: () => run(() => editor.chain().focus().toggleBlockquote().run()) },
    { key: 'callout', icon: <I.IconCallout size={15} />, label: '高亮块', active: editor.isActive('callout'), onClick: () => run(() => editor.chain().focus().toggleCallout().run()) },
    { key: 'sync', icon: <I.IconSync size={15} />, label: '同步块', active: false, onClick: () => run(() => insertMockBlock(editor, 'sync')) },
  ]

  return (
    <div className="fe-tstyle">
      {rows.map((r) => (
        <div key={r.key} className={`fe-mi ${r.active ? 'on' : ''}`} onClick={r.onClick}>
          <span className="fe-mi-ic">{r.icon}</span>
          <span className="fe-mi-t">{r.label}</span>
          {r.active && <span className="fe-mi-check">✓</span>}
        </div>
      ))}
      {nested.length > 0 && (
        <>
          <div className={`fe-mi has-sub ${nestedOpen ? 'on' : ''}`} onClick={() => setNestedOpen((v) => !v)}>
            <span className="fe-mi-ic"><I.IconHeading level={9} /></span>
            <span className="fe-mi-t">其他标题</span>
            <span className="fe-mi-arrow"><I.IconChevronRight size={12} style={{ transform: nestedOpen ? 'rotate(90deg)' : 'none' }} /></span>
          </div>
          {nestedOpen && nested.map((lv) => {
            const r = headingRow(lv)
            return (
              <div key={r.key} className={`fe-mi sub ${r.active ? 'on' : ''}`} onClick={r.onClick}>
                <span className="fe-mi-ic">{r.icon}</span>
                <span className="fe-mi-t">{r.label}</span>
                {r.active && <span className="fe-mi-check">✓</span>}
              </div>
            )
          })}
        </>
      )}
      <div className="fe-menu-sep" />
      {mainRows.map((r) => (
        <div key={r.key} className={`fe-mi ${r.active ? 'on' : ''}`} onClick={r.onClick}>
          <span className="fe-mi-ic">{r.icon}</span>
          <span className="fe-mi-t">{r.label}</span>
          {r.active && <span className="fe-mi-check">✓</span>}
        </div>
      ))}

      {withLayout && (
        <>
          <div className="fe-menu-sep" />
          <div className="fe-tstyle-row">
            <span className="lbl">缩进</span>
            <button className="fe-mini-btn" title="减少缩进" onClick={() => run(() => editor.commands.decreaseIndent())}><I.IconIndentOut size={14} /></button>
            <button className="fe-mini-btn" title="增加缩进" onClick={() => run(() => editor.commands.increaseIndent())}><I.IconIndentIn size={14} /></button>
          </div>
          <div className="fe-tstyle-row">
            <span className="lbl">对齐</span>
            <button className="fe-mini-btn" title="左对齐" onClick={() => run(() => editor.chain().focus().setTextAlign('left').run())}><I.IconAlignLeft size={14} /></button>
            <button className="fe-mini-btn" title="居中" onClick={() => run(() => editor.chain().focus().setTextAlign('center').run())}><I.IconAlignCenter size={14} /></button>
            <button className="fe-mini-btn" title="右对齐" onClick={() => run(() => editor.chain().focus().setTextAlign('right').run())}><I.IconAlignRight size={14} /></button>
          </div>
        </>
      )}
    </div>
  )
}
