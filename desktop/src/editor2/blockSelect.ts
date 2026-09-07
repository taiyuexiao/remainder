/**
 * Esc 选中整块（对齐飞书）：
 * - 按 Esc：光标所在的顶层块进入选中态（蓝色底）
 * - 再按 Esc：取消选中
 * - 任何编辑 / 光标变化自动取消选中
 */
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const blockSelectKey = new PluginKey<DecorationSet | null>('feBlockSelect')

export const BlockSelect = Extension.create({
  name: 'feBlockSelect',

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet | null>({
        key: blockSelectKey,
        state: {
          init: () => null,
          apply: (tr, value) => {
            const set = tr.getMeta(blockSelectKey)
            if (set !== undefined) return set
            if (tr.docChanged || tr.selectionSet) return null
            return value
          },
        },
        props: {
          handleKeyDown(view, event) {
            if (event.key !== 'Escape') return false
            // 有浮层打开（斜杠菜单/AI面板/把手菜单等）时让位，
            // Esc 交给对应浮层处理（如斜杠菜单需先删除 /query）
            if (document.querySelector('.fe-slash-popup, .fe-ai-popup, .fe-pop, .fe-mini-toolbar, .fe-dd-panel')) {
              return false
            }
            const current = blockSelectKey.getState(view.state)
            if (current) {
              view.dispatch(view.state.tr.setMeta(blockSelectKey, null))
              return true
            }
            const { $from } = view.state.selection
            if ($from.depth < 1) return false
            const from = $from.before(1)
            const to = $from.after(1)
            view.dispatch(view.state.tr.setMeta(blockSelectKey, DecorationSet.create(view.state.doc, [
              Decoration.node(from, to, { class: 'fe-block-selected' }),
            ])))
            return true
          },
          decorations(state) {
            return blockSelectKey.getState(state)
          },
        },
      }),
    ]
  },
})
