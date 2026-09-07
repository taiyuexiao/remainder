/**
 * Markdown 粘贴转换（对齐飞书"粘贴 Markdown 自动成块"）：
 * - 支持：标题 1~9、无序/有序列表、引用、代码块（```lang）、分割线、
 *   行内 加粗/斜体/删除线/行内代码/链接
 * - 粘贴纯文本时若命中块级语法则自动转换，否则走默认粘贴
 */

export interface TiptapJSON {
  type: string
  attrs?: Record<string, unknown>
  content?: TiptapJSON[]
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
  text?: string
}

/* ---------- 行内解析 ---------- */

const INLINE_RE = /(`[^`]+`)|(!?\[[^\]]*\]\([^)\s]+\))|(\*\*[^*]+\*\*)|(~~[^~]+~~)|(\*[^*\n]+\*)|(__[^_]+__)|(_[^_\n]+_)/

function parseInline(text: string): TiptapJSON[] {
  if (!text) return []
  const out: TiptapJSON[] = []
  let rest = text
  for (;;) {
    const m = INLINE_RE.exec(rest)
    if (!m || m.index === undefined) break
    if (m.index > 0) out.push({ type: 'text', text: rest.slice(0, m.index) })
    const token = m[0]
    if (token.startsWith('`')) {
      out.push({ type: 'text', text: token.slice(1, -1), marks: [{ type: 'code' }] })
    } else if (token.startsWith('![')) {
      const mm = /!\[([^\]]*)\]\(([^)\s]+)\)/.exec(token)
      if (mm) out.push({ type: 'image', attrs: { src: mm[2], alt: mm[1] } })
    } else if (token.startsWith('[')) {
      const mm = /\[([^\]]*)\]\(([^)\s]+)\)/.exec(token)
      if (mm) out.push({ type: 'text', text: mm[1], marks: [{ type: 'link', attrs: { href: mm[2] } }] })
    } else if (token.startsWith('**')) {
      out.push({ type: 'text', text: token.slice(2, -2), marks: [{ type: 'bold' }] })
    } else if (token.startsWith('~~')) {
      out.push({ type: 'text', text: token.slice(2, -2), marks: [{ type: 'strike' }] })
    } else if (token.startsWith('__')) {
      out.push({ type: 'text', text: token.slice(2, -2), marks: [{ type: 'bold' }] })
    } else if (token.startsWith('*')) {
      out.push({ type: 'text', text: token.slice(1, -1), marks: [{ type: 'italic' }] })
    } else if (token.startsWith('_')) {
      out.push({ type: 'text', text: token.slice(1, -1), marks: [{ type: 'italic' }] })
    }
    rest = rest.slice(m.index + token.length)
  }
  if (rest) out.push({ type: 'text', text: rest })
  return out
}

function para(text: string): TiptapJSON {
  const content = parseInline(text)
  return { type: 'paragraph', content: content.length ? content : undefined }
}

/* ---------- 块级解析 ---------- */

export function markdownToTiptapJSON(md: string): TiptapJSON {
  const lines = md.replace(/\r/g, '').split('\n')
  const blocks: TiptapJSON[] = []
  let i = 0

  const isListLine = (s: string) => /^(\s*)([-*+]|\d+[.)])\s+/.test(s)
  const listInfo = (s: string) => {
    const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(s)
    if (!m) return null
    return { ordered: /\d/.test(m[2]), text: m[3] }
  }

  while (i < lines.length) {
    const line = lines[i]

    // 代码块
    const fence = /^\s*```(\w*)\s*$/.exec(line)
    if (fence) {
      const lang = fence[1] || 'plain text'
      const buf: string[] = []
      i++
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        buf.push(lines[i])
        i++
      }
      i++ // 跳过闭合 ```
      blocks.push({ type: 'codeBlock', attrs: { language: lang }, content: [{ type: 'text', text: buf.join('\n') }] })
      continue
    }

    // 分割线
    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) {
      blocks.push({ type: 'horizontalRule' })
      i++
      continue
    }

    // 标题
    const heading = /^(#{1,9})\s+(.*)$/.exec(line)
    if (heading) {
      blocks.push({
        type: 'heading',
        attrs: { level: heading[1].length },
        content: parseInline(heading[2]),
      })
      i++
      continue
    }

    // 引用（连续 > 行合并）
    if (/^\s*>\s?/.test(line)) {
      const buf: string[] = []
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''))
        i++
      }
      blocks.push({ type: 'blockquote', content: buf.map(para) })
      continue
    }

    // 列表（连续行；支持一层嵌套）
    if (isListLine(line)) {
      const first = listInfo(line)!
      const items: TiptapJSON[] = []
      while (i < lines.length && isListLine(lines[i])) {
        const info = listInfo(lines[i])!
        // listItem 内容必须是块级（paragraph 包裹行内 runs）
        const itemContent: TiptapJSON[] = [para(info.text)]
        // 嵌套层（缩进 2+ 空格的下一行）
        const nested: TiptapJSON[] = []
        i++
        while (i < lines.length && /^\s{2,}[-*+]\s+/.test(lines[i]) === true && isListLine(lines[i])) {
          const sub = listInfo(lines[i])!
          const subItems = nested.length && (nested[nested.length - 1] as { type: string }).type === (sub.ordered ? 'orderedList' : 'bulletList')
            ? (nested[nested.length - 1].content as TiptapJSON[])
            : null
          const li: TiptapJSON = { type: 'listItem', content: [para(sub.text)] }
          if (subItems) subItems.push(li)
          else nested.push({ type: sub.ordered ? 'orderedList' : 'bulletList', content: [li] })
          i++
        }
        if (nested.length) itemContent.push(...nested)
        items.push({ type: 'listItem', content: itemContent })
      }
      // 列表类型以第一行为准
      blocks.push({ type: first.ordered ? 'orderedList' : 'bulletList', content: items })
      continue
    }

    // 空行
    if (!line.trim()) {
      i++
      continue
    }

    // 普通段落
    blocks.push(para(line))
    i++
  }

  return { type: 'doc', content: blocks.length ? blocks : [{ type: 'paragraph' }] }
}

/** 是否值得按 Markdown 处理（避免劫持普通文本粘贴） */
export function looksLikeMarkdown(text: string): boolean {
  if (text.length > 20000) return false
  const lines = text.split('\n')
  const blocky = lines.some((l) =>
    /^(#{1,9}\s|\s*[-*+]\s|\s*\d+[.)]\s|\s*>\s|\s*```|---+\s*$)/.test(l),
  )
  return blocky
}
