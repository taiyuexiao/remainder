/**
 * 本地评论（二期真协作的占位层）：
 * - CommentMark：高亮标记（data-comment-id），一人多段
 * - 命令：选中文字加标记 / 按评论 id 移除标记
 * - 评论数据存 IndexedDB（store.ts），UI 见 EditorPage 的 CommentsPanel
 */
import { Mark, mergeAttributes, type CommandProps } from '@tiptap/core'

export const CommentMark = Mark.create({
  name: 'comment',
  // 不互相吞噬光标行为；选区跨块时不合并
  inclusive: false,

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-comment-id'),
        renderHTML: (attrs) => ({ 'data-comment-id': attrs.commentId }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-comment-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'fe-comment-mark' }), 0]
  },

  addCommands() {
    return {
      setCommentMark:
        (commentId: string) =>
        ({ commands }: CommandProps) =>
          commands.setMark(this.name, { commentId }),

      removeCommentMarkById:
        (commentId: string) =>
        ({ state, tr, dispatch }: CommandProps) => {
          const markType = state.schema.marks.comment
          if (!markType) return false
          const ranges: Array<{ from: number; to: number }> = []
          state.doc.descendants((node, pos) => {
            node.marks
              .filter((m) => m.type === markType && m.attrs.commentId === commentId)
              .forEach(() => {
                // 记录文本节点范围（mark 粒度=文本节点）
                ranges.push({ from: pos, to: pos + node.nodeSize })
              })
            return true
          })
          if (!ranges.length) return false
          if (dispatch) {
            ranges.reverse().forEach(({ from, to }) => {
              tr.removeMark(from, to, markType)
            })
          }
          return true
        },
    }
  },
})

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    comment: {
      setCommentMark: (commentId: string) => ReturnType
      removeCommentMarkById: (commentId: string) => ReturnType
    }
  }
}
