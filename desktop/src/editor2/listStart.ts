/**
 * M40 列表序号顶格配套：ol[start] 同步到 DOM。
 * 序号改用 CSS counter 渲染（原生 marker 位置不受控），但 WKWebView 不支持
 * counter-reset 里的 attr()，这里用 node decoration 把 start 写进内联 style，
 * 让「3. 」新起列表、Markdown 粘贴等路径的起始编号保持正确。
 */
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const ListStartSync = Extension.create({
  name: 'listStartSync',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('listStartSync'),
        props: {
          decorations(state) {
            const decos: Decoration[] = []
            state.doc.descendants((node, pos) => {
              if (node.type.name === 'orderedList') {
                const start = Number(node.attrs.start) || 1
                if (start > 1) {
                  decos.push(
                    Decoration.node(pos, pos + node.nodeSize, {
                      style: `counter-reset: fe-ol ${start - 1}`,
                    }),
                  )
                }
              }
            })
            if (!decos.length) return DecorationSet.empty
            return DecorationSet.create(state.doc, decos)
          },
        },
      }),
    ]
  },
})
