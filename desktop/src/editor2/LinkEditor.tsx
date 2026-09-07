/**
 * 链接编辑面板 — Toolbar / BubbleToolbar 共用
 * 输入链接回车确认；已有链接时可移除
 */
import { useState } from 'react'
import type { Editor } from '@tiptap/core'
import { IconLink } from './icons'

export function LinkEditor({ editor, close }: { editor: Editor; close?: () => void }) {
  const [value, setValue] = useState((editor.getAttributes('link').href as string) ?? '')

  const submit = () => {
    const v = value.trim()
    if (!v) {
      editor.chain().focus().unsetLink().run()
    } else {
      const url = /^(https?:\/\/|mailto:)/i.test(v) ? v : `https://${v}`
      editor.chain().focus().setLink({ href: url }).run()
    }
    close?.()
  }

  return (
    <div className="fe-link-editor" onClick={(e) => e.stopPropagation()}>
      <span className="fe-link-editor-icon"><IconLink size={14} /></span>
      <input
        autoFocus
        value={value}
        placeholder="输入链接，回车确认"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            submit()
          }
          if (e.key === 'Escape') close?.()
        }}
      />
      {editor.isActive('link') && (
        <button
          className="fe-link-remove"
          onClick={() => {
            editor.chain().focus().unsetLink().run()
            close?.()
          }}
        >
          移除
        </button>
      )}
    </div>
  )
}
