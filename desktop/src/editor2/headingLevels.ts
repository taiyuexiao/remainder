/**
 * 标题渐进显示（对齐飞书"防滥用层级"设计）：
 * - 默认只展示 一级~三级 标题
 * - 文档中使用了 H3 后出现 H4，使用了 H4 后出现 H5……最多至 H9
 * - 规则：可见级别 = 1..min(9, max(3, 已使用最深层级 + 1))
 * - 「其他标题」子菜单收录未被直接展示的级别（N+1..9）
 * 飞书从文档内容实时推导，删除标题后立即回缩；此处保持一致，不持久化。
 */
import type { Node as PMNode } from '@tiptap/pm/model'

export const MIN_VISIBLE_LEVEL = 3
export const MAX_LEVEL = 9

/** 文档中已使用的最深层级（0 表示无标题） */
export function getUsedMaxHeadingLevel(doc: PMNode): number {
  let max = 0
  doc.descendants((node) => {
    if (node.type.name === 'heading') {
      const lv = Number(node.attrs.level) || 0
      if (lv > max) max = lv
    }
    return max < MAX_LEVEL // 已到九级时无需继续遍历
  })
  return max
}

/** 直接展示的标题级别：1..N */
export function getVisibleHeadingLevels(doc: PMNode): number[] {
  const used = getUsedMaxHeadingLevel(doc)
  const n = Math.min(MAX_LEVEL, Math.max(MIN_VISIBLE_LEVEL, used + 1))
  return Array.from({ length: n }, (_, i) => i + 1)
}

/** 「其他标题」子菜单级别：N+1..9（空数组表示全部已直接展示） */
export function getNestedHeadingLevels(doc: PMNode): number[] {
  const shown = getVisibleHeadingLevels(doc).length
  return Array.from({ length: MAX_LEVEL - shown }, (_, i) => shown + 1 + i)
}
