/**
 * 块级输入规则的飞书行为补齐：
 * 1. 列表项内输入 `[] `/`[x] ` → 仅当前项转换为待办（必要时分裂列表）——飞书列表按行独立类型
 * 2. 引用/列表/高亮块内输入 `---` → 分割线提升到顶层（而非嵌在容器内）
 *
 * 优先级高于 StarterKit 内置规则；不适用的场景先返回 null（不改 transaction），交回内置规则。
 * tiptap v2 输入规则模型：handler 就地修改 state.tr，返回非 null 即视为已处理。
 */
import { Extension, InputRule, type Range } from '@tiptap/core'
import { TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
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
})
