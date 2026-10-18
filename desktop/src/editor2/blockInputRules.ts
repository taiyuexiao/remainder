/**
 * 块级输入规则的飞书行为补齐：
 * 1. 列表项内输入 `[] `/`[x] ` → 仅当前项转换为待办（必要时分裂列表）——飞书列表按行独立类型
 * 2. 引用/列表/高亮块内输入 `---` → 分割线提升到顶层（而非嵌在容器内）
 * 3. (M40) 顶层段落输入 `N. ` / `- ` → 上一兄弟是同类列表则并入续号；
 *    有序且不紧邻时按输入数字新建列表（start=N，渲染由 listStartSync 兜底）。
 *    Word/飞书均为此行为：「1. 」续接上文编号，不再永远从 1 重来。
 *
 * 优先级高于 StarterKit 内置规则；不适用的场景先返回 null（不改 transaction），交回内置规则。
 * tiptap v2 输入规则模型：handler 就地修改 state.tr，返回非 null 即视为已处理。
 */
import { Extension, InputRule, type Range } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import type { ResolvedPos } from '@tiptap/pm/model'

/** 在 $from 向上找最近的 listItem 深度，找不到返回 -1 */
function findListItemDepth($from: ResolvedPos): number {
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'listItem') return d
  }
  return -1
}

/**
 * 把当前 listItem 转成 taskItem（父列表转成 taskList）。
 * 列表中还有其他项时，先在当前项前后分裂列表，使当前项单独成列表再转换。
 */
function convertListItemToTask(state: EditorState, tr: Transaction, range: Range, checked: boolean): boolean {
  const $from = state.doc.resolve(range.from)
  const itemDepth = findListItemDepth($from)
  if (itemDepth < 2) return false

  const listDepth = itemDepth - 1
  const listTypeName = $from.node(listDepth).type.name
  if (listTypeName !== 'bulletList' && listTypeName !== 'orderedList') return false

  const { taskItem, taskList } = state.schema.nodes
  if (!taskItem || !taskList) return false

  tr.delete(range.from, range.to)

  // ① 前面有兄弟项 → 在当前项之前分裂列表
  if ($from.index(listDepth) > 0) {
    tr.split($from.before(itemDepth), 1)
  }

  // ② 后面有兄弟项 → 在当前项之后分裂列表
  {
    const $p = tr.doc.resolve(tr.mapping.map(range.from))
    const id = findListItemDepth($p)
    if (id < 2) return true
    const ld = id - 1
    if ($p.index(ld) < $p.node(ld).childCount - 1) {
      tr.split($p.after(id), 1)
    }
  }

  // ③ 原子替换：整个单元素列表 → 新 taskList（内含转换后的 taskItem），
  //    一步到位，避免 setNodeMarkup 逐级校验中间态
  {
    const $p = tr.doc.resolve(tr.mapping.map(range.from))
    const id = findListItemDepth($p)
    if (id < 2) return true
    const listPos = $p.before(id - 1)
    const listNode = $p.node(id - 1)
    const itemNode = $p.node(id)
    const newItem = taskItem.create({ checked }, itemNode.content, itemNode.marks)
    const newList = taskList.create(null, newItem)
    tr.replaceWith(listPos, listPos + listNode.nodeSize, newList)
  }
  return true
}

/** 嵌套结构内的 `---`：分割线提升到顶层块之后 */
function hoistHr(state: EditorState, tr: Transaction, range: Range, match: RegExpMatchArray): boolean {
  const $from = state.doc.resolve(range.from)
  if ($from.depth <= 1) return false // 顶层交给内置规则

  const para = $from.parent
  if (para.type.name !== 'paragraph') return false

  const { horizontalRule: hrType, paragraph: pType } = state.schema.nodes
  if (!hrType || !pType) return false

  const topStart = $from.before(1)
  const topEnd = $from.after(1)
  const topNode = $from.node(1)
  const marker = match[0].trim()

  // 顶层块内容仅为标记本身（如空引用行）→ 整块替换为 hr + 空段落
  if (topNode.textContent.trim() === marker) {
    tr.replaceWith(topStart, topEnd, [hrType.create(), pType.create()])
    tr.setSelection(TextSelection.create(tr.doc, Math.min(topStart + 2, tr.doc.content.size)))
    return true
  }

  // 顶层块还有其他内容 → 删除含标记的段落，在块后插入 hr + 空段落
  const paraFrom = $from.before($from.depth)
  const paraTo = $from.after($from.depth)
  tr.delete(paraFrom, paraTo)
  const insertPos = tr.mapping.map(topEnd)
  tr.insert(insertPos, [hrType.create(), pType.create()])
  tr.setSelection(TextSelection.create(tr.doc, Math.min(insertPos + 2, tr.doc.content.size)))
  return true
}

export const FeishuBlockInputRules = Extension.create({
  name: 'feishuBlockInputRules',
  priority: 200,

  addInputRules() {
    return [
      // (M40) 顶层段落输入 "N. " → 紧邻有序列表则并入续号；否则按输入数字新建列表（start=N）
      new InputRule({
        find: /^(\d+)\.\s$/,
        handler: ({ state, range, match }) => {
          const $from = state.doc.resolve(range.from)
          if ($from.depth !== 1) return null
          const idx = $from.index(0)
          const prev = idx > 0 ? state.doc.child(idx - 1) : null
          const tr = state.tr
          tr.delete(range.from, range.to)
          const paraStart = tr.mapping.map($from.before())
          if (prev && prev.type.name === 'orderedList') {
            return appendParaToList(state, tr, paraStart) ? undefined : null
          }
          const num = parseInt(match[1], 10)
          if (!Number.isFinite(num) || num < 1) return null
          return wrapParaAsOrderedList(state, tr, paraStart, num) ? undefined : null
        },
      }),
      // (M40) 顶层段落输入 "- " → 紧邻无序列表则并入；否则交回内置规则
      new InputRule({
        find: /^(?:[-+*])\s$/,
        handler: ({ state, range }) => {
          const $from = state.doc.resolve(range.from)
          if ($from.depth !== 1) return null
          const idx = $from.index(0)
          const prev = idx > 0 ? state.doc.child(idx - 1) : null
          if (!prev || prev.type.name !== 'bulletList') return null
          const tr = state.tr
          tr.delete(range.from, range.to)
          const paraStart = tr.mapping.map($from.before())
          return appendParaToList(state, tr, paraStart) ? undefined : null
        },
      }),
      // 列表项内 [] / [ ] / [x] → 待办
      new InputRule({
        find: /^\[( |x|X)?\] $/,
        handler: ({ state, range, match }) => {
          const ok = convertListItemToTask(state, state.tr as Transaction, range, (match[1] ?? '').toLowerCase() === 'x')
          return ok ? undefined : null
        },
      }),
      // 嵌套结构内 --- → 分割线提升到顶层
      new InputRule({
        find: /^(?:---|—-|___\s|\*\*\*\s)$/,
        handler: ({ state, range, match }) => {
          const ok = hoistHr(state, state.tr as Transaction, range, match)
          return ok ? undefined : null
        },
      }),
    ]
  },

  addProseMirrorPlugins() {
    return [
      // (M40) 相邻同类列表自动合并（对齐飞书）：toggle/输入规则/粘贴产生的双列表合为一个，编号自然延续
      new Plugin({
        key: new PluginKey('feAutoJoinLists'),
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((t) => t.docChanged)) return null
          const tr = newState.tr
          let joined = false
          for (let pass = 0; pass < 20; pass++) {
            let merged = false
            let offset = 0
            const children: Array<{ name: string; start: number; end: number }> = []
            tr.doc.forEach((child) => {
              children.push({ name: child.type.name, start: offset, end: offset + child.nodeSize })
              offset += child.nodeSize
            })
            for (let i = 0; i < children.length - 1; i++) {
              const a = children[i]
              const b = children[i + 1]
              const joinable =
                (a.name === 'orderedList' && b.name === 'orderedList') ||
                (a.name === 'bulletList' && b.name === 'bulletList')
              if (!joinable) continue
              const bNode = tr.doc.child(i + 1)
              tr.insert(a.end - 1, bNode.content)
              tr.delete(tr.mapping.map(b.start), tr.mapping.map(b.end))
              joined = true
              merged = true
              break
            }
            if (!merged) break
          }
          return joined ? tr : null
        },
      }),
    ]
  },
})

/** 把光标所在段落（标记已删）转成 listItem 追加到紧邻前一个列表的末尾，光标落进新项 */
function appendParaToList(state: EditorState, tr: Transaction, paraStart: number): boolean {
  const $p = tr.doc.resolve(paraStart)
  if ($p.depth !== 1 || $p.parent.type.name !== 'paragraph') return false
  const para = $p.parent
  const item = state.schema.nodes.listItem.create(null, para.type.create(null, para.content))
  tr.insert(paraStart - 1, item)
  tr.delete(paraStart + item.nodeSize, paraStart + item.nodeSize + para.nodeSize)
  const cursor = Math.min(paraStart - 1 + 2, tr.doc.content.size)
  tr.setSelection(TextSelection.create(tr.doc, cursor))
  return true
}

/** 当前段落包成 start=N 的有序列表（Word/飞书行为：输入「3. 」即从 3 起号） */
function wrapParaAsOrderedList(state: EditorState, tr: Transaction, paraStart: number, startNum: number): boolean {
  const $p = tr.doc.resolve(paraStart)
  if ($p.depth !== 1 || $p.parent.type.name !== 'paragraph') return false
  const para = $p.parent
  const paraEnd = paraStart + para.nodeSize
  const list = state.schema.nodes.orderedList.create(
    { start: startNum },
    state.schema.nodes.listItem.create(null, para),
  )
  tr.replaceWith(paraStart, paraEnd, list)
  const cursor = Math.min(paraStart + 3, tr.doc.content.size)
  tr.setSelection(TextSelection.create(tr.doc, cursor))
  return true
}
