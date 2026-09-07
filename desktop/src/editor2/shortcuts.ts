/**
 * 飞书快捷键对齐（来源：官方《在文档中使用快捷键》，平台差异按 UA 区分）：
 * - 标题 ⌘⌥1~9 / 正文 ⌘⌥0
 * - 引用 ⌘⇧> · 代码块 ⌘⌥C · 任务 ⌘⌥T · 分割线 ⌘⌥S · 删除线 ⌘⇧X
 * - 行内代码 Win Ctrl+Shift+C / Mac Ctrl+⌘C
 * - 移动当前块 Win Alt+Shift+↑↓ / Mac ⌘⇧↑↓
 * - 全选：连按两下（第一次选当前块，第二次全选）
 * - 评论 ⌘⌥M（占位）
 */
import { Extension } from '@tiptap/core'
import type { Level } from '@tiptap/extension-heading'
import { currentTopBlockIndex, moveTopBlock } from './blockOps'
import { slashHelpers } from './slashHelpers'

export const isMac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.userAgent)

/** 平台差异的快捷键展示文案（Tooltip 用） */
export function keyHint(mac: string, win: string): string {
  return isMac ? mac : win
}

/** Tiptap Level 类型只声明到 6，标题 7~9 需要收窄断言 */
const lv = (n: number) => n as unknown as Level

export const FeishuShortcuts = Extension.create({
  name: 'feishuShortcuts',

  addKeyboardShortcuts() {
    let lastSelectAll = 0
    const heading = (n: number) => () => this.editor.chain().focus().toggleHeading({ level: lv(n) }).run()

    return {
      // ---------- 标题 / 正文 ----------
      'Mod-Alt-1': heading(1),
      'Mod-Alt-2': heading(2),
      'Mod-Alt-3': heading(3),
      'Mod-Alt-4': heading(4),
      'Mod-Alt-5': heading(5),
      'Mod-Alt-6': heading(6),
      'Mod-Alt-7': heading(7),
      'Mod-Alt-8': heading(8),
      'Mod-Alt-9': heading(9),
      'Mod-Alt-0': () => this.editor.chain().focus().setParagraph().run(),

      // ---------- 列表 / 引用 / 代码块 / 任务 / 分割线 ----------
      'Mod-Shift-7': () => this.editor.commands.toggleOrderedList(),
      'Mod-Shift-8': () => this.editor.commands.toggleBulletList(),
      'Mod->': () => this.editor.commands.toggleBlockquote(),
      'Mod-Shift->': () => this.editor.commands.toggleBlockquote(),
      'Mod-Alt-c': () => this.editor.commands.toggleCodeBlock(),
      'Mod-Alt-t': () => this.editor.commands.toggleTaskList(),
      'Mod-Alt-s': () => this.editor.commands.setHorizontalRule(),

      // ---------- 行内样式 ----------
      'Mod-Shift-x': () => this.editor.commands.toggleStrike(),
      ...(isMac
        ? { 'Ctrl-Cmd-c': () => this.editor.commands.toggleCode() }
        : { 'Mod-Shift-c': () => this.editor.commands.toggleCode() }),

      // ---------- 重做（Windows 官方为 Ctrl+Y） ----------
      ...(isMac ? {} : { 'Mod-y': () => this.editor.commands.redo() }),

      // ---------- 移动当前块 ----------
      ...(isMac
        ? {
            'Mod-Shift-ArrowUp': () => moveTopBlock(this.editor, currentTopBlockIndex(this.editor), -1),
            'Mod-Shift-ArrowDown': () => moveTopBlock(this.editor, currentTopBlockIndex(this.editor), 1),
          }
        : {
            'Alt-Shift-ArrowUp': () => moveTopBlock(this.editor, currentTopBlockIndex(this.editor), -1),
            'Alt-Shift-ArrowDown': () => moveTopBlock(this.editor, currentTopBlockIndex(this.editor), 1),
          }),

      // ---------- 评论（占位） ----------
      'Mod-Alt-m': () => {
        slashHelpers.toast('评论功能即将上线，二期接入')
        return true
      },

      // ---------- 连按全选：第一次选当前块，第二次全选 ----------
      'Mod-a': ({ editor }) => {
        const now = Date.now()
        if (now - lastSelectAll < 600) {
          lastSelectAll = 0
          return editor.commands.selectAll()
        }
        lastSelectAll = now
        const index = currentTopBlockIndex(editor)
        const doc = editor.state.doc
        let pos = 0
        for (let i = 0; i < index; i++) pos += doc.child(i).nodeSize
        const child = doc.child(index)
        // 原子块（图片/分割线/占位卡）→ 选中节点本身
        if (child.isAtom || child.isLeaf) return editor.chain().setNodeSelection(pos).run()
        return editor
          .chain()
          .setTextSelection({ from: pos + 1, to: Math.min(pos + child.nodeSize - 1, doc.content.size) })
          .run()
      },
    }
  },
})
