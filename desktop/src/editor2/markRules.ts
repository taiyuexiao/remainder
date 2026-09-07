/**
 * 行内 Markdown 即时转换 —— 对齐飞书行为（§3.2）
 * Tiptap 内置规则要求标记前必须是空白/行首，中文文本紧跟 `**加粗**` 时不会转换；
 * 飞书在任意文字后输入闭合标记都会即时转换，故自定义宽松的输入规则。
 */
import { InputRule } from '@tiptap/core'
import type { MarkType } from '@tiptap/pm/model'
import Bold from '@tiptap/extension-bold'
import Italic from '@tiptap/extension-italic'
import Strike from '@tiptap/extension-strike'
import Code from '@tiptap/extension-code'

interface LooseRuleConfig {
  find: RegExp
  type: MarkType
  /** 单侧标记长度：`**`=2、`*`=1 */
  marker: number
}

/**
 * 宽松版 mark 输入规则：
 * - 允许标记紧跟任意字符（含中文），无需前导空白
 * - 只删除两侧标记，保留前缀字符
 * - 命中范围已在行内代码内时不触发（code 排除其他 mark）
 */
function looseMarkInputRule(config: LooseRuleConfig) {
  return new InputRule({
    find: config.find,
    handler: ({ state, range, match }) => {
      const { tr } = state
      const inner = match[match.length - 1]
      const fullMatch = match[0]
      if (!inner) return null

      // 内部文本在匹配串中的位置是确定的：总长 - 结尾标记 - 内部文本
      const textStart = range.from + (fullMatch.length - config.marker - inner.length)
      const textEnd = textStart + inner.length

      // 不跨越行内代码触发（code mark 排斥其他样式）
      const codeMark = state.schema.marks.code
      if (codeMark && config.type !== codeMark && state.doc.rangeHasMark(textStart, textEnd, codeMark)) {
        return null
      }

      // 先删结尾标记（高位），再删开头标记，最后给剩余文本加 mark
      if (textEnd < range.to) tr.delete(textEnd, range.to)
      tr.delete(textStart - config.marker, textStart)
      tr.addMark(textStart - config.marker, textEnd - config.marker, config.type.create())
      tr.removeStoredMark(config.type)
    },
  })
}

/** 加粗：**text** / __text__（保留快捷键等父级行为） */
export const FeBold = Bold.extend({
  addInputRules() {
    return [
      looseMarkInputRule({ find: /\*\*([^*]+)\*\*$/, type: this.type, marker: 2 }),
      looseMarkInputRule({ find: /__([^_]+)__$/, type: this.type, marker: 2 }),
    ]
  },
})

/** 斜体：*text* / _text_（开标记前不能是同类字符，避免与加粗冲突） */
export const FeItalic = Italic.extend({
  addInputRules() {
    return [
      looseMarkInputRule({ find: /(?:^|[^*])\*([^*]+)\*$/, type: this.type, marker: 1 }),
      looseMarkInputRule({ find: /(?:^|[^_])_([^_]+)_$/, type: this.type, marker: 1 }),
    ]
  },
})

/** 删除线：~~text~~ */
export const FeStrike = Strike.extend({
  addInputRules() {
    return [
      looseMarkInputRule({ find: /~~([^~]+)~~$/, type: this.type, marker: 2 }),
    ]
  },
})

/** 行内代码：`text` */
export const FeCode = Code.extend({
  addInputRules() {
    return [
      looseMarkInputRule({ find: /`([^`]+)`$/, type: this.type, marker: 1 }),
    ]
  },
})
