/**
 * AI 侧栏结果写入文档的操作（对齐需求：填充到正文下方 / 替代当前文本 / 作为引用 / 作为代码框）
 */
import type { Editor } from '@tiptap/core'
import { currentTopBlockIndex, getTopBlockAt } from '../blockOps'

/** 把 AI 输出按空行/换行拆成段落数组 */
export function toParagraphNodes(text: string): Array<Record<string, unknown>> {
  const parts = text.replace(/\r/g, '').split(/\n{2,}|\n/).map((s) => s.trim()).filter(Boolean)
  if (!parts.length) return [{ type: 'paragraph' }]
  return parts.map((t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] }))
}

interface TopInfo { pos: number; size: number }

function currentTop(editor: Editor): TopInfo | null {
  const info = getTopBlockAt(editor, currentTopBlockIndex(editor))
  if (!info) return null
  return { pos: info.pos, size: info.size }
}

/** 插入到当前块下方（"填充到正文下面"） */
export function appendBelow(editor: Editor, text: string) {
  const paras = toParagraphNodes(text)
  const top = currentTop(editor)
  if (!top) {
    editor.chain().focus().insertContent(paras).run()
    return
  }
  editor.chain().focus().insertContentAt(top.pos + top.size, paras).run()
}

/** 替代当前文本：有选区替换选区；无选区替换当前块内容 */
export function replaceCurrent(editor: Editor, text: string) {
  const paras = toParagraphNodes(text)
  const { from, to, empty } = editor.state.selection
  if (!empty) {
    editor.chain().focus().deleteRange({ from, to }).insertContentAt(from, paras).run()
    return
  }
  const top = currentTop(editor)
  if (!top) {
    editor.chain().focus().insertContent(paras).run()
    return
  }
  editor.chain().focus().deleteRange({ from: top.pos, to: top.pos + top.size }).insertContentAt(top.pos, paras).run()
}

/** 作为引用块插入到当前块下方 */
export function insertAsQuote(editor: Editor, text: string) {
  const paras = toParagraphNodes(text)
  const node = { type: 'blockquote', content: paras }
  const top = currentTop(editor)
  if (!top) {
    editor.chain().focus().insertContent(node).run()
    return
  }
  editor.chain().focus().insertContentAt(top.pos + top.size, node).run()
}

/** 作为代码块插入到当前块下方 */
export function insertAsCode(editor: Editor, text: string) {
  const node = {
    type: 'codeBlock',
    attrs: { language: 'plain' },
    content: [{ type: 'text', text: text.replace(/\n+$/, '') }],
  }
  const top = currentTop(editor)
  if (!top) {
    editor.chain().focus().insertContent(node).run()
    return
  }
  editor.chain().focus().insertContentAt(top.pos + top.size, node).run()
}
