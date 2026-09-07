import React, { useEffect, useRef, useState } from 'react'

/** 通用下拉：trigger + 面板，点击外部/Esc 关闭。面板内按钮需阻止 mousedown 默认以保住编辑器选区 */
export function Dropdown(props: {
  button: (o: { open: boolean }) => React.ReactNode
  children: (close: () => void) => React.ReactNode
  align?: 'left' | 'right'
  width?: number
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="fe-dd" ref={ref}>
      <div
        onMouseDown={e => e.preventDefault()}
        onClick={() => setOpen(!open)}
      >
        {props.button({ open })}
      </div>
      {open && (
        <div
          className={`fe-dd-panel ${props.align === 'right' ? 'fe-dd-right' : ''}`}
          style={props.width ? { minWidth: props.width } : undefined}
          onMouseDown={e => e.stopPropagation()}
        >
          {props.children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

export function MenuItem(props: {
  icon?: React.ReactNode
  title: React.ReactNode
  desc?: string
  active?: boolean
  danger?: boolean
  onClick?: () => void
}) {
  return (
    <div
      className={`fe-mi ${props.active ? 'on' : ''} ${props.danger ? 'danger' : ''}`}
      onMouseDown={e => e.preventDefault()}
      onClick={props.onClick}
    >
      {props.icon != null && <span className="fe-mi-ic">{props.icon}</span>}
      <span className="fe-mi-t">{props.title}</span>
      {props.desc && <span className="fe-mi-d">{props.desc}</span>}
    </div>
  )
}
