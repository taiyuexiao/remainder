import { useState } from 'react'
import { Node, mergeAttributes, type CommandProps } from '@tiptap/core'
import { NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'

export interface CalloutAttrs {
  emoji?: string
  color?: string
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      /** 将当前块转换为高亮块 */
      setCallout: (attrs?: CalloutAttrs) => ReturnType
      /** 切换高亮块 */
      toggleCallout: (attrs?: CalloutAttrs) => ReturnType
    }
  }
}

/** 高亮块配色（设计规范 §2.1 高亮色板） */
export const CALLOUT_COLORS: { key: string; label: string; bg: string }[] = [
  { key: 'gray', label: '灰色', bg: '#F2F3F5' },
  { key: 'blue', label: '蓝色', bg: '#E1EAFF' },
  { key: 'green', label: '绿色', bg: '#EFFBEF' },
  { key: 'yellow', label: '黄色', bg: '#FFF1B8' },
  { key: 'purple', label: '紫色', bg: '#EADCFF' },
  { key: 'pink', label: '粉色', bg: '#FFD6E7' },
  { key: 'orange', label: '橙色', bg: '#FFE7BA' },
]

const EMOJIS = ['💡', '📌', '✅', '⚠️', '❗', '🎉', '💬', '🔥']

/** 高亮块 NodeView（emoji + 底色切换） */
export function CalloutView({ node, updateAttributes, selected }: NodeViewProps) {
  const [open, setOpen] = useState(false)
  const emoji = (node.attrs.emoji as string) || '💡'
  const colorKey = (node.attrs.color as string) || 'blue'
  const bg = CALLOUT_COLORS.find((c) => c.key === colorKey)?.bg ?? CALLOUT_COLORS[1].bg

  return (
    <NodeViewWrapper className="fe-callout" style={{ background: bg }} data-selected={selected ? 'true' : undefined}>
      <div className="fe-callout-inner">
        <button
          className="fe-callout-emoji"
          contentEditable={false}
          title="更换图标/颜色"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setOpen(!open)}
        >
          {emoji}
        </button>
        {open && (
          <div className="fe-callout-picker" contentEditable={false}>
            <div className="fe-callout-picker-row">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  className={`fe-callout-pick-emoji ${e === emoji ? 'on' : ''}`}
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => {
                    updateAttributes({ emoji: e })
                    setOpen(false)
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
            <div className="fe-callout-picker-row">
              {CALLOUT_COLORS.map((c) => (
                <button
                  key={c.key}
                  className={`fe-callout-pick-color ${c.key === colorKey ? 'on' : ''}`}
                  style={{ background: c.bg }}
                  title={c.label}
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => {
                    updateAttributes({ color: c.key })
                    setOpen(false)
                  }}
                />
              ))}
            </div>
          </div>
        )}
        <NodeViewContent className="fe-callout-content" />
      </div>
    </NodeViewWrapper>
  )
}

/** 高亮块 Node 定义（内容为 block+，隔离光标） */
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      emoji: {
        default: '💡',
        parseHTML: (el) => el.getAttribute('data-emoji') || '💡',
        renderHTML: (attrs) => ({ 'data-emoji': attrs.emoji }),
      },
      color: {
        default: 'blue',
        parseHTML: (el) => el.getAttribute('data-color') || 'blue',
        renderHTML: (attrs) => ({ 'data-color': attrs.color }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'callout' }), 0]
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView)
  },

  addCommands() {
    return {
      setCallout:
        (attrs?: CalloutAttrs) =>
        ({ commands }: CommandProps) =>
          commands.wrapIn(this.name, attrs),
      toggleCallout:
        (attrs?: CalloutAttrs) =>
        ({ commands }: CommandProps) =>
          commands.toggleWrap(this.name, attrs),
    }
  },
})
