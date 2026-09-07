import type { Editor } from '@tiptap/core'
import type { ReactNode } from 'react'
import { TEXT_COLORS, HIGHLIGHT_COLORS } from './palettes'

/** 工具栏按钮（28×28，§4.4） */
export function ToolbarBtn({ icon, tip, on, onClick, label, dim }: {
  icon?: ReactNode
  tip?: string
  label?: string
  on?: boolean
  dim?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      className={`fe-tbtn${on ? ' on' : ''}${dim ? ' dim' : ''}`}
      title={tip}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {icon}
      {label && <span className="fe-tbtn-label">{label}</span>}
    </button>
  )
}

/** 下拉菜单项 */
export function MenuItem({ icon, title, desc, on, danger, onClick }: {
  icon?: ReactNode
  title: ReactNode
  desc?: string
  on?: boolean
  danger?: boolean
  onClick: () => void
}) {
  return (
    <div
      className={`fe-mi${on ? ' on' : ''}${danger ? ' danger' : ''}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {icon && <span className="fe-mi-icon">{icon}</span>}
      <span className="fe-mi-body">
        <span className="fe-mi-title">{title}</span>
        {desc && <span className="fe-mi-desc">{desc}</span>}
      </span>
      {on && <span className="fe-mi-check">✓</span>}
    </div>
  )
}

export function MenuSep() {
  return <div className="fe-menu-sep" />
}

/**
 * 合并颜色面板（对齐飞书「字体颜色 + 背景色」一个面板，含恢复默认）
 */
export function ColorPanel({ editor, onChange }: { editor: Editor; onChange?: () => void }) {
  return (
    <div className="fe-picker">
      <div className="fe-picker-title">文字颜色</div>
      <div className="fe-color-grid">
        {TEXT_COLORS.map((s) => (
          <button
            key={s.name}
            type="button"
            className={`fe-color-dot${!s.color ? ' default' : ''}`}
            title={s.name}
            style={s.color ? { background: s.color } : undefined}
            onClick={() => {
              if (s.color) editor.chain().focus().setColor(s.color).run()
              else editor.chain().focus().unsetColor().run()
              onChange?.()
            }}
          >
            {!s.color && <span className="fe-color-default">A</span>}
          </button>
        ))}
      </div>
      <div className="fe-picker-title">背景颜色</div>
      <div className="fe-color-grid">
        {HIGHLIGHT_COLORS.map((s) => (
          <button
            key={s.color}
            type="button"
            className="fe-color-dot"
            style={{ background: s.color }}
            title={s.name}
            onClick={() => { editor.chain().focus().toggleHighlight({ color: s.color }).run(); onChange?.() }}
          />
        ))}
      </div>
      <div
        className="fe-picker-foot"
        onClick={() => { editor.chain().focus().unsetColor().unsetHighlight().run(); onChange?.() }}
      >
        恢复默认
      </div>
    </div>
  )
}
