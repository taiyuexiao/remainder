/**
 * 顶层块操作（复制/剪切/上移/下移/删除）—— BlockHandle 与快捷键(⌘⇧↑↓)共用。
 * 统一按"顶层块"粒度操作，与飞书 Alt+Shift+↑/↓（Mac ⌘⇧↑/↓）移动整块行为对齐。
 */
import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'

export interface TopBlock {
  index: number
  pos: number
  size: number
  node: PMNode
}

export function getTopBlockAt(editor: Editor, index: number): TopBlock | null {
  const doc = editor.state.doc
  if (index < 0 || index >= doc.childCount) return null
  let pos = 0
  for (let i = 0; i < index; i++) pos += doc.child(i).nodeSize
  const node = doc.child(index)
  return { index, pos, size: node.nodeSize, node }
}

/** 光标当前所在的顶层块序号 */
export function currentTopBlockIndex(editor: Editor): number {
  const pos = editor.state.selection.from
  const doc = editor.state.doc
  let acc = 0
  for (let i = 0; i < doc.childCount; i++) {
    const size = doc.child(i).nodeSize
    if (pos < acc + size || (pos === acc + size && i === doc.childCount - 1)) return i
    acc += size
  }
  return Math.max(0, doc.childCount - 1)
}

function replaceTopBlock(editor: Editor, index: number, json: Record<string, unknown>, targetIndex: number) {
  const info = getTopBlockAt(editor, index)
  if (!info) return
  const neighbor = getTopBlockAt(editor, targetIndex)
  if (!neighbor) return
  const insertAt = targetIndex < index ? neighbor.pos : neighbor.pos + neighbor.size
  editor
    .chain()
    .focus()
    .deleteRange({ from: info.pos, to: info.pos + info.size })
    // 删除后位置回退一个 nodeSize，再映射到目标插入点
    .insertContentAt(Math.max(0, targetIndex < index ? insertAt : insertAt - info.size), json)
    .run()
}

export function moveTopBlock(editor: Editor, index: number, dir: -1 | 1): boolean {
  const target = index + dir
  const doc = editor.state.doc
  if (target < 0 || target >= doc.childCount) return false
  const info = getTopBlockAt(editor, index)
  if (!info) return false
  const json = info.node.toJSON()
  replaceTopBlock(editor, index, json, target)
  return true
}

export function duplicateTopBlock(editor: Editor, index: number): boolean {
  const info = getTopBlockAt(editor, index)
  if (!info) return false
  editor.chain().focus().insertContentAt(info.pos + info.size, info.node.toJSON()).run()
  return true
}

export function cutTopBlock(editor: Editor, index: number): boolean {
  const info = getTopBlockAt(editor, index)
  if (!info) return false
  const json = info.node.toJSON()
  try {
    void navigator.clipboard.writeText(JSON.stringify(json))
  } catch {
    /* 剪贴板不可用时仅删除 */
  }
  editor.chain().focus().deleteRange({ from: info.pos, to: info.pos + info.size }).run()
  return true
}

export function deleteTopBlock(editor: Editor, index: number): boolean {
  const info = getTopBlockAt(editor, index)
  if (!info) return false
  editor.chain().focus().deleteRange({ from: info.pos, to: info.pos + info.size }).run()
  return true
}
