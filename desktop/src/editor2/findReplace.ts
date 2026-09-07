/**
 * 查找与替换（⌘F / ⌘⇧H，对齐飞书）：
 * - FeFindReplace 扩展：搜索词高亮（Decoration）+ 定位下一个/上一个 + 单处替换 + 全部替换
 * - 匹配按"单个文本节点内"扫描（跨节点/跨样式的词不匹配，符合一般编辑器直觉，实现简单可靠）
 * - UI 面板在 EditorPage，通过命令交互；匹配数从插件状态读取
 */
import { Extension, type CommandProps } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export interface FindMatch { from: number; to: number }
export interface FindState {
  search: string
  matches: FindMatch[]
  index: number
}

export const findReplaceKey = new PluginKey<FindState>('feFindReplace')

/** 在单个文本节点内查找全部匹配 */
function findInChunk(text: string, pos: number, search: string): FindMatch[] {
  const out: FindMatch[] = []
  const haystack = text.toLowerCase()
  const needle = search.toLowerCase()
  let idx = haystack.indexOf(needle)
  while (idx >= 0) {
    out.push({ from: pos + idx, to: pos + idx + search.length })
    idx = haystack.indexOf(needle, idx + needle.length)
  }
  return out
}

function scanMatches(doc: import('@tiptap/pm/model').Node, search: string): FindMatch[] {
  if (!search.trim()) return []
  const matches: FindMatch[] = []
  doc.descendants((node, pos) => {
    if (node.isText && node.text) matches.push(...findInChunk(node.text, pos, search.trim()))
    return true
  })
  return matches
}

export const FeFindReplace = Extension.create({
  name: 'feFindReplace',

  addCommands() {    return {
      findSet:
        (search: string) =>
        ({ tr, dispatch }: CommandProps) => {
          if (dispatch) tr.setMeta(findReplaceKey, { search, index: 0 })
          return true
        },
      findGoto:
        (dir: 1 | -1) =>
        ({ state, tr, dispatch }: CommandProps) => {
          const st = findReplaceKey.getState(state)
          if (!st || !st.matches.length) return false
          const index = (st.index + dir + st.matches.length) % st.matches.length
          if (dispatch) {
            tr.setMeta(findReplaceKey, { search: st.search, index })
            const m = st.matches[index]
            tr.setSelection(TextSelection.create(tr.doc, m.from, m.to))
            tr.scrollIntoView()
          }
          return true
        },
      findReplaceOne:
        (replaceText: string) =>
        ({ state, tr, dispatch }: CommandProps) => {
          const st = findReplaceKey.getState(state)
          if (!st || !st.matches.length) return false
          const m = st.matches[st.index % st.matches.length]
          if (dispatch) {
            tr.insertText(replaceText, m.from, m.to)
            tr.setMeta(findReplaceKey, { search: st.search, index: st.index })
            tr.scrollIntoView()
          }
          return true
        },
      findReplaceAll:
        (replaceText: string) =>
        ({ state, tr, dispatch }: CommandProps) => {
          const st = findReplaceKey.getState(state)
          if (!st || !st.matches.length) return false
          if (dispatch) {
            // 从后往前替换，前面的位置不受影响
            for (let i = st.matches.length - 1; i >= 0; i--) {
              const m = st.matches[i]
              tr.insertText(replaceText, m.from, m.to)
            }
            tr.setMeta(findReplaceKey, { search: st.search, index: 0 })
          }
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<FindState>({
        key: findReplaceKey,
        state: {
          init: () => ({ search: '', matches: [], index: 0 }),
          apply: (tr, value) => {
            const meta = tr.getMeta(findReplaceKey) as Partial<FindState> | undefined
            const search = meta?.search ?? value.search
            const docChanged = tr.docChanged
            if (!meta && !docChanged) return value
            const matches = scanMatches(tr.doc, search)
            const prevIndex = meta?.index ?? value.index
            return { search, matches, index: Math.min(prevIndex, Math.max(matches.length - 1, 0)) }
          },
        },
        props: {
          decorations(state) {
            const st = findReplaceKey.getState(state)
            if (!st || !st.search || !st.matches.length) return DecorationSet.empty
            const decos = st.matches.map((m, i) =>
              i === st.index
                ? Decoration.inline(m.from, m.to, { class: 'fe-find-current' })
                : Decoration.inline(m.from, m.to, { class: 'fe-find-match' }),
            )
            return DecorationSet.create(state.doc, decos)
          },
        },
      }),
    ]
  },
})

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    feFindReplace: {
      findSet: (search: string) => ReturnType
      findGoto: (dir: 1 | -1) => ReturnType
      findReplaceOne: (replaceText: string) => ReturnType
      findReplaceAll: (replaceText: string) => ReturnType
    }
  }
}
