/**
 * 块缩进（对齐飞书"缩进适用于标题/正文段落/列表/任务等"）：
 * - paragraph / heading 增加 indent 属性（0~9 级），渲染为左 margin
 * - 列表内 Tab 走 listItem sink/lift；普通块 Tab 增减 indent
 * - (M40) 非空选区跨块时整体缩进：选区内每个列表项 sink/lift、段落/标题 indent±1（全选后按 Tab 集体右移）
 */
import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'

const MIN_INDENT = 0
const MAX_INDENT = 9

const LIST_TYPES = ['orderedList', 'bulletList', 'taskList']

/** 光标是否位于表格单元格内（表格内 Tab 交给 prosemirror-tables 切换单元格） */
function insideTableCell($from: { depth: number; node(d: number): { type: { name: string } } }): boolean {
  for (let d = $from.depth; d > 0; d--) {
    const name = $from.node(d).type.name
    if (name === 'tableCell' || name === 'tableHeader') return true
  }
  return false
}

/** 选区触及代码块时不做批量缩进（代码块内 Tab 是输入空格） */
function touchesCodeBlock(
  $from: { depth: number; node(d: number): { type: { name: string } } },
  $to: { depth: number; node(d: number): { type: { name: string } } },
): boolean {
  for (let d = 1; d <= $from.depth; d++) {
    if ($from.node(d).type.name === 'codeBlock') return true
  }
  for (let d = 1; d <= $to.depth; d++) {
    if ($to.node(d).type.name === 'codeBlock') return true
  }
  return false
}

/**
 * 非空选区整体缩进（M40，对齐飞书）：
 * - 选区落在同一列表内 → 一次 sink/liftListItem（prosemirror 原生支持范围批量：
 *   选中 [2..3] 项 Tab → 两项平行挂到第 1 项下，而非逐项阶梯）
 * - 跨顶层块 → 段落/标题 indent±1（列表整列 sink 无宿主，交回原生行为）
 */
function indentSelection(editor: import('@tiptap/core').Editor, dir: 1 | -1): boolean {
  const { state } = editor
  const { $from, $to } = state.selection
  if (touchesCodeBlock($from, $to)) return false

  const range = $from.blockRange($to)
  if (range && LIST_TYPES.includes(range.parent.type.name)) {
    const itemType = range.parent.type.name === 'taskList' ? 'taskItem' : 'listItem'
    return dir === 1
      ? editor.chain().sinkListItem(itemType).run()
      : editor.chain().liftListItem(itemType).run()
  }

  if ($from.depth !== 1) return false
  const { from, to } = state.selection
  const chain = editor.chain()
  let any = false
  const blocks: Array<{ pos: number; node: PMNode }> = []
  state.doc.forEach((node, offset) => {
    if (offset + node.nodeSize <= from || offset >= to) return
    blocks.push({ pos: offset, node })
  })
  for (let i = blocks.length - 1; i >= 0; i--) {
    const { pos, node } = blocks[i]
    if (node.type.name === 'paragraph' || node.type.name === 'heading') {
      const cur = Number(node.attrs.indent) || 0
      const next = Math.min(Math.max(cur + dir, MIN_INDENT), MAX_INDENT)
      if (next !== cur) {
        chain.command(({ tr }) => {
          tr.setNodeMarkup(pos, null, { ...node.attrs, indent: next })
          return true
        })
        any = true
      }
    }
  }
  if (!any) return false
  chain.run()
  return true
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
        if (insideTableCell(state.selection.$from)) return false
        // 非空选区 → 批量缩进（选区整体右移，含多个列表项/段落混合）
        if (!state.selection.empty && indentSelection(editor, 1)) return true
        return editor.commands.increaseIndent()
      },
      'Shift-Tab': ({ editor }) => {
        if (insideTableCell(editor.state.selection.$from)) return false
        if (!editor.state.selection.empty && indentSelection(editor, -1)) return true
        return editor.commands.decreaseIndent()
      },
      // 空列表项（回车生成的空 "2." 项）按 Backspace → lift 出列表回顶格段落。
      // 默认 joinBackward 会把空项并成上一项内的第二个段落，卡在列表里出不来（M33）
      Backspace: ({ editor }) => {
        const { $from, empty } = editor.state.selection
        if (!empty || $from.parentOffset !== 0 || $from.parent.content.size !== 0) return false
        const d = $from.depth - 1
        if (d <= 0) return false
        const name = $from.node(d).type.name
        if (name !== 'listItem' && name !== 'taskItem') return false
        if ($from.index(d) !== 0) return false // 项内非首个段落：走默认合并
        return editor.commands.liftListItem(name)
      },
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
