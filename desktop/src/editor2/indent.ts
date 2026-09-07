/**
 * 块缩进（对齐飞书"缩进适用于标题/正文段落/列表/任务等"）：
 * - paragraph / heading 增加 indent 属性（0~9 级），渲染为左 margin
 * - 列表内 Tab 走 listItem sink/lift；普通块 Tab 增减 indent
 */
import { Extension } from '@tiptap/core'

const MIN_INDENT = 0
const MAX_INDENT = 9

/** 光标是否位于表格单元格内（表格内 Tab 交给 prosemirror-tables 切换单元格） */
function insideTableCell($from: { depth: number; node(d: number): { type: { name: string } } }): boolean {
  for (let d = $from.depth; d > 0; d--) {
    const name = $from.node(d).type.name
    if (name === 'tableCell' || name === 'tableHeader') return true
  }
  return false
}

export const FeIndent = Extension.create({
  name: 'feIndent',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          indent: {
            default: 0,
            parseHTML: (el) => {
              const v = parseInt(el.getAttribute('data-indent') || '0', 10)
              return Number.isFinite(v) ? Math.min(Math.max(v, MIN_INDENT), MAX_INDENT) : 0
            },
            renderHTML: (attrs) => {
              const n = Number(attrs.indent) || 0
              if (n <= 0) return {}
              return { 'data-indent': n, style: `margin-left: ${n * 24}px` }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      increaseIndent:
        () =>
        ({ state, commands }) => {
          if (insideTableCell(state.selection.$from)) return false
          // 列表内 → sink；普通块 → indent+1
          if (state.selection.$from.node(-2)?.type.name === 'listItem') {
            return commands.sinkListItem('listItem')
          }
          const { $from } = state.selection
          const node = $from.parent
          if (node.type.name !== 'paragraph' && node.type.name !== 'heading') return false
          const cur = Number(node.attrs.indent) || 0
          const next = Math.min(cur + 1, MAX_INDENT)
          if (next === cur) return false
          return commands.updateAttributes(node.type.name, { indent: next })
        },
      decreaseIndent:
        () =>
        ({ state, commands }) => {
          if (insideTableCell(state.selection.$from)) return false
          if (state.selection.$from.node(-2)?.type.name === 'listItem') {
            return commands.liftListItem('listItem')
          }
          const { $from } = state.selection
          const node = $from.parent
          if (node.type.name !== 'paragraph' && node.type.name !== 'heading') return false
          const cur = Number(node.attrs.indent) || 0
          if (cur <= MIN_INDENT) return false
          return commands.updateAttributes(node.type.name, { indent: cur - 1 })
        },
    }
  },

  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        const { state } = editor
        if (state.selection.$from.parent.type.name === 'codeBlock') {
          return editor.chain().focus().insertContent('  ').run()
        }
        return editor.commands.increaseIndent()
      },
      'Shift-Tab': ({ editor }) => editor.commands.decreaseIndent(),
    }
  },
})

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    feIndent: {
      increaseIndent: () => ReturnType
      decreaseIndent: () => ReturnType
    }
  }
}
