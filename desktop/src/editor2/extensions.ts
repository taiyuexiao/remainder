// Tiptap Schema 定义 —— 设计规范 v2（块模型 / Markdown / 飞书交互 / AI 与 P1 块能力）
import StarterKit from '@tiptap/starter-kit'
import { type AnyExtension } from '@tiptap/core'
import type { Level } from '@tiptap/extension-heading'
import TextStyle from '@tiptap/extension-text-style'
import FontFamily from '@tiptap/extension-font-family'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import { Callout } from './CalloutView'
import { FeCodeBlock } from './CodeBlockView'
import { MockBlock } from './mockBlocks'
import { FeImage } from './ImageView'
import {
  Formula, InlineFormula, Grid, GridColumn, Mention, MentionSuggestion, DateChip,
} from './advancedBlocks'
import { CommentMark } from './commentMark'
import { FeFindReplace } from './findReplace'
import { SlashMenuExtension } from './SlashMenu'
import { FeBold, FeItalic, FeStrike, FeCode } from './markRules'
import { FeishuBlockInputRules } from './blockInputRules'
import { FeIndent } from './indent'
import { FeishuShortcuts } from './shortcuts'
import { BlockSelect } from './blockSelect'
import { markdownToTiptapJSON, looksLikeMarkdown } from './mdPaste'
import { FontSizeAttr } from './textStyle'
import { parseTableText, rowsToTableHtml } from './tableDetect'
import { DOMParser as PmDOMParser } from '@tiptap/pm/model'

/** 飞书支持标题 1~9 级；Tiptap Level 类型只声明到 6，此处扩展 */
const HEADING_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as unknown as Level[]

/** 单元格支持背景色与对齐（配合表格菜单的 setCellAttribute） */
const FeTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-bg') || '',
        renderHTML: (attrs) => (attrs.backgroundColor ? { 'data-bg': attrs.backgroundColor, style: `background-color:${attrs.backgroundColor}` } : {}),
      },
      textAlign: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-align') || '',
        renderHTML: (attrs) => (attrs.textAlign ? { 'data-align': attrs.textAlign } : {}),
      },
    }
  },
})

export function buildExtensions(): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: { levels: HEADING_LEVELS },
      codeBlock: false, // 使用 CodeBlockLowlight 自定义块（语法高亮）
      bold: false,      // 行内 Markdown 规则替换为放宽版（对齐飞书，见 markRules.ts）
      italic: false,
      strike: false,
      code: false,
    }),
    FeBold,
    FeItalic,
    FeStrike,
    FeCode,
    FeishuBlockInputRules,
    TextStyle,
    FontFamily,
    FontSizeAttr,
    Color,
    Highlight.configure({ multicolor: true }),
    Underline,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Link.configure({ openOnClick: false, autolink: true }),
    Placeholder.configure({
      placeholder: ({ node }) =>
        node.type.name === 'heading' ? '标题' : '输入 / 快速插入内容',
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    FeImage,
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    FeTableCell,
    Callout,
    FeCodeBlock,
    MockBlock,
    // ---- P1 真实内容块 ----
    Formula,
    InlineFormula,
    Grid,
    GridColumn,
    Mention,
    DateChip,
    // ---- 评论 / 查找替换 ----
    CommentMark,
    FeFindReplace,
    // ---- 飞书交互扩展 ----
    FeIndent,
    SlashMenuExtension,
    MentionSuggestion,
    FeishuShortcuts,
    BlockSelect,
  ]
}

/** 粘贴/拖拽图片与 Markdown 粘贴转换（挂在 EditorContent 的编辑器上） */
export function editorPropsForPaste(readFileAsDataURL: (file: File) => Promise<string>) {
  return {
    handlePaste: (view: import('@tiptap/pm/view').EditorView, event: ClipboardEvent) => {
      // 1) 图片文件 → 上传插入
      const files = Array.from(event.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'))
      if (files.length) {
        event.preventDefault()
        void (async () => {
          let inserted = false
          for (const f of files) {
            const src = await readFileAsDataURL(f)
            const node = view.state.schema.nodes.image.create({ src })
            if (!inserted) {
              view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView())
              inserted = true
            } else {
              view.dispatch(view.state.tr.insert(view.state.selection.from, node))
            }
          }
        })()
        return true
      }
      // 2) 表格文本（Tab/多空格/管道分列）→ 自动转表格（M14 tableDetect 回植）
      const text = event.clipboardData?.getData('text/plain') ?? ''
      const tableRows = text ? parseTableText(text) : null
      if (tableRows) {
        event.preventDefault()
        const dom = new window.DOMParser().parseFromString(rowsToTableHtml(tableRows), 'text/html')
        const slice = PmDOMParser.fromSchema(view.state.schema).parseSlice(dom.body)
        view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView())
        return true
      }
      // 3) Markdown 文本 → 自动成块
      if (text && looksLikeMarkdown(text)) {
        event.preventDefault()
        const json = markdownToTiptapJSON(text)
        view.dispatch(view.state.tr.replaceSelection(json as never).scrollIntoView())
        return true
      }
      return false
    },
    handleDrop: (view: import('@tiptap/pm/view').EditorView, event: DragEvent) => {
      const files = Array.from(event.dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/'))
      if (!files.length) return false
      event.preventDefault()
      void (async () => {
        const src = await readFileAsDataURL(files[0])
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
        const pos = coords ? coords.pos : view.state.selection.from
        const node = view.state.schema.nodes.image.create({ src })
        view.dispatch(view.state.tr.insert(pos, node).scrollIntoView())
      })()
      return true
    },
  }
}
