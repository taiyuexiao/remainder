/**
 * 斜杠菜单条目数据（对齐飞书实机分组）：
 * AI帮我写（特殊置顶）｜ 基础 ｜ 常用 ｜ 按钮 ｜ 团队协作
 * - 标题按渐进规则注入「基础」组（headingLevels.ts）
 * - keywords 收录官方 / 缩写（/h1、/tp、/bg、/yy、/yxlb…）与英文词，见帮助中心《/ 快速插入支持的内容类型缩写》
 * - 数据(电子表格)/多维表格 分组按评审决策暂缓，不呈现
 */
import type { Editor, Range } from '@tiptap/core'
import type { ReactNode } from 'react'
import * as I from './icons'
import { getVisibleHeadingLevels } from './headingLevels'
import { insertMockBlock } from './mockBlocks'
import { insertGridContent, openUserPicker, todayStr } from './advancedBlocks'
import { slashHelpers } from './slashHelpers'
import { defaultCodeLang } from './CodeBlockView'

export type SlashGroup = '基础' | '常用' | '按钮' | '团队协作'

export interface SlashCtx {
  editor: Editor
  /** 输入 /query 唤起时为斜杠文本范围；块把手「+」唤起时为 undefined */
  range?: Range
}

export interface SlashItem {
  group: SlashGroup | 'AI'
  title: string
  desc: string
  icon: ReactNode
  keywords: string[]
  command: (ctx: SlashCtx) => void
}

function run(editor: Editor, range: Range | undefined, fn: () => unknown) {
  if (range) editor.chain().focus().deleteRange(range).run()
  fn()
}

/* ---------- 行内链接：插入占位文本并套链接，提示用 ⌘K 修改 ---------- */
function insertInlineLink(editor: Editor, range?: Range) {
  run(editor, range, () => {
    const { empty } = editor.state.selection
    if (empty) {
      editor
        .chain()
        .focus()
        .insertContent([{ type: 'text', text: '链接文本', marks: [{ type: 'link', attrs: { href: 'https://' } }] }])
        .run()
    } else {
      editor.chain().focus().setLink({ href: 'https://' }).run()
    }
    slashHelpers.toast('已插入链接，选中后按 ⌘K 修改地址')
  })
}

const pickImage = (editor: Editor, range?: Range) => {
  run(editor, range, () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        editor.chain().focus().setImage({ src: String(reader.result) }).run()
      }
      reader.readAsDataURL(file)
    }
    input.click()
  })
}

const CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九']

/** 图片选择（顶部工具栏「插入图片」也复用） */
export const pickAndInsertImage = (editor: Editor) => pickImage(editor)

export const AI_ITEM: SlashItem = {
  group: 'AI',
  title: 'AI帮我写',
  desc: '写作 · 续写 · 润色 · 翻译 · 总结',
  icon: <I.IconAI size={16} />,
  keywords: ['ai', '帮我写', '写作', '续写', '润色', '翻译', '总结', 'write'],
  command: ({ editor, range }) => run(editor, range, () => slashHelpers.openAI(editor, { quick: true })),
}

/** 基础组：文本 + 渐进标题 + 列表/代码/引用/分割线/链接（顺序对齐飞书实机） */
function basicItems(editor: Editor): SlashItem[] {
  return [
    {
      group: '基础', title: '文本', desc: '开始输入正文', icon: <I.IconTextT size={16} />,
      keywords: ['text', 'wb', 'wenben', '正文', 'paragraph'],
      command: ({ editor: e, range }) => run(e, range, () => e.chain().focus().setParagraph().run()),
    },
    ...getVisibleHeadingLevels(editor.state.doc).map((n) => ({
      group: '基础' as const,
      title: `${CN[n - 1]}级标题`,
      desc: `大中小标题，用于章节结构`,
      icon: <I.IconHeading level={n} />,
      keywords: [`h${n}`, `/h${n}`, `heading${n}`, `bt${n}`, `biaoti${n}`, `标题${n}`],
      command: ({ editor: e, range }: SlashCtx) => run(e, range, () => e.chain().focus().setNode('heading', { level: n }).run()),
    })),
    {
      group: '基础', title: '有序列表', desc: '创建带编号的列表', icon: <I.IconOrderedList size={16} />,
      keywords: ['ordered list', 'yxlb', 'youxu', '有序', '/yxlb', 'numbered'],
      command: ({ editor: e, range }) => run(e, range, () => e.chain().focus().toggleOrderedList().run()),
    },
    {
      group: '基础', title: '无序列表', desc: '创建无序符号列表', icon: <I.IconBulletList size={16} />,
      keywords: ['bulleted list', 'wxlb', 'wuxu', '无序', '/wxlb'],
      command: ({ editor: e, range }) => run(e, range, () => e.chain().focus().toggleBulletList().run()),
    },
    {
      group: '基础', title: '代码块', desc: '插入一段代码', icon: <I.IconCodeBlock size={16} />,
      keywords: ['code', 'dmk', 'daimakuai', '代码', '/dmk'],
      command: ({ editor: e, range }) => run(e, range, () => e.chain().focus().toggleCodeBlock({ language: defaultCodeLang() }).run()),
    },
    {
      group: '基础', title: '引用', desc: '插入引用内容', icon: <I.IconQuote size={16} />,
      keywords: ['quote', 'yy', 'yinyong', '/yy'],
      command: ({ editor: e, range }) => run(e, range, () => e.chain().focus().toggleBlockquote().run()),
    },
    {
      group: '基础', title: '分割线', desc: '分隔内容', icon: <I.IconDivider size={16} />,
      keywords: ['divider', 'fgx', 'fengexian', 'hr', '/fgx'],
      command: ({ editor: e, range }) => run(e, range, () => e.chain().focus().setHorizontalRule().run()),
    },
    {
      group: '基础', title: '链接', desc: '插入超链接', icon: <I.IconLink size={16} />,
      keywords: ['link', 'lj', 'lianji', 'url', '/lj', '超链接'],
      command: ({ editor: e, range }) => insertInlineLink(e, range),
    },
  ]
}

export function buildSlashItems(editor: Editor): SlashItem[] {
  return [
    AI_ITEM,
    ...basicItems(editor),
    /* ---------- 常用 ---------- */
    {
      group: '常用', title: '任务', desc: '创建待办并跟踪进度', icon: <I.IconTodoList size={16} />,
      keywords: ['todo', 'rw', 'renwu', '待办', '/rw'],
      command: ({ editor: e, range }) => run(e, range, () => e.chain().focus().toggleTaskList().run()),
    },
    {
      group: '常用', title: '图片', desc: '插入图片', icon: <I.IconImage size={16} />,
      keywords: ['image', 'tp', 'tupian', 'pic', '/tp', '照片'],
      command: ({ editor: e, range }) => pickImage(e, range),
    },
    {
      group: '常用', title: '视频或文件', desc: '上传视频或添加附件', icon: <I.IconFileMedia size={16} />,
      keywords: ['file', 'video', 'wj', 'sp', '视频', '文件', '附件', '/wj', '/sp'],
      command: ({ editor: e, range }) => run(e, range, () => insertMockBlock(e, 'media')),
    },
    {
      group: '常用', title: '表格', desc: '插入一个表格', icon: <I.IconTable size={16} />,
      keywords: ['table', 'bg', 'biaoge', '/bg'],
      command: ({ editor: e, range }) => run(e, range, () => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()),
    },
    {
      group: '常用', title: '分栏', desc: '并排组织多栏内容', icon: <I.IconColumns size={16} />,
      keywords: ['column', 'fl', 'fenlan', '布局', '/fl'],
      command: ({ editor: e, range }) => run(e, range, () => insertGridContent(e, '2')),
    },
    {
      group: '常用', title: '高亮块', desc: '突出显示重要内容', icon: <I.IconCallout size={16} />,
      keywords: ['callout', 'glk', 'gaoliangkuai', '高亮', '/glk'],
      command: ({ editor: e, range }) => run(e, range, () => e.chain().focus().insertContent({ type: 'callout', attrs: { emoji: '💡', color: 'blue' }, content: [{ type: 'paragraph' }] }).run()),
    },
    {
      group: '常用', title: '同步块', desc: '创建可多文档同步的内容块', icon: <I.IconSync size={16} />,
      keywords: ['sync', 'tongbu', '同步', '/tb'],
      command: ({ editor: e, range }) => run(e, range, () => insertMockBlock(e, 'sync')),
    },
    {
      group: '常用', title: '公式', desc: '插入 LaTeX 数学公式', icon: <I.IconFormula size={16} />,
      keywords: ['equation', 'formula', 'gs', 'gongshi', '数学', '/gs', '/eq'],
      command: ({ editor: e, range }) => run(e, range, () => e.chain().focus().insertFormula().run()),
    },
    {
      group: '常用', title: '模版', desc: '从模版库插入内容', icon: <I.IconTemplate size={16} />,
      keywords: ['template', 'mb', 'muban', '/mb', '模板'],
      command: ({ editor: e, range }) => run(e, range, () => slashHelpers.openTemplates(e)),
    },
    /* ---------- 按钮（文档级操作） ---------- */
    {
      group: '按钮', title: '打开超链接', desc: '为选中内容设置链接', icon: <I.IconLink size={16} />,
      keywords: ['url', 'hyperlink', '超链接'],
      command: ({ editor: e, range }) => insertInlineLink(e, range),
    },
    {
      group: '按钮', title: '创建副本', desc: '复制一篇当前文档', icon: <I.IconCopy size={16} />,
      keywords: ['duplicate', 'copy', 'fujian', '副本'],
      command: ({ editor: e, range }) => run(e, range, () => slashHelpers.duplicateDoc()),
    },
    {
      group: '按钮', title: '关注文档更新', desc: '文档有更新时提醒我', icon: <I.IconStar size={16} />,
      keywords: ['follow', 'subscribe', 'guanzhu', '关注', '订阅'],
      command: ({ editor: e, range }) => run(e, range, () => slashHelpers.toast('已关注文档更新（演示）')),
    },
    /* ---------- 团队协作 ---------- */
    {
      group: '团队协作', title: '人员', desc: '提及一位协作者', icon: <I.IconAvatar size={16} />,
      keywords: ['people', 'user', 'ry', 'renyuan', '成员', '@'],
      command: ({ editor: e, range }) => run(e, range, () => openUserPicker(e)),
    },
    {
      group: '团队协作', title: '群名片', desc: '分享一个飞书群', icon: <I.IconUsers size={16} />,
      keywords: ['group card', 'qmp', 'qunmingpian', '群', '/qmp', '/group'],
      command: ({ editor: e, range }) => run(e, range, () => insertMockBlock(e, 'group')),
    },
    {
      group: '团队协作', title: '云文档', desc: '嵌入一篇云文档', icon: <I.IconDoc size={16} />,
      keywords: ['docs', 'ywd', 'yunwendang', '/ywd', '/docs'],
      command: ({ editor: e, range }) => run(e, range, () => insertMockBlock(e, 'doc')),
    },
    {
      group: '团队协作', title: '任务清单', desc: '插入结构化任务清单', icon: <I.IconChecklist size={16} />,
      keywords: ['checklist', 'rwqd', 'renwuqingdan'],
      command: ({ editor: e, range }) => run(e, range, () => insertMockBlock(e, 'checklist')),
    },
    {
      group: '团队协作', title: '投票', desc: '发起投票收集意见', icon: <I.IconVote size={16} />,
      keywords: ['vote', 'poll', 'tp', 'toupiao', '/vote', '/poll'],
      command: ({ editor: e, range }) => run(e, range, () => insertMockBlock(e, 'vote')),
    },
    {
      group: '团队协作', title: '日期提醒', desc: '插入日期并设置提醒', icon: <I.IconBell size={16} />,
      keywords: ['date', 'reminder', 'rq', 'riqi', '//', '/rq', '/date'],
      command: ({ editor: e, range }) => run(e, range, () => e.chain().focus().insertContent({ type: 'dateChip', attrs: { date: todayStr() } }).run()),
    },
    {
      group: '团队协作', title: '信息收集', desc: '用表单收集信息', icon: <I.IconClipboard size={16} />,
      keywords: ['info collector', 'xxsj', 'xinxishouji', '表单', '/xxsj'],
      command: ({ editor: e, range }) => run(e, range, () => insertMockBlock(e, 'collect')),
    },
    {
      group: '团队协作', title: '日程', desc: '插入日程邀请', icon: <I.IconCalendar size={16} />,
      keywords: ['calendar', 'rc', 'richeng', '/rc', '/calendar'],
      command: ({ editor: e, range }) => run(e, range, () => insertMockBlock(e, 'calendar')),
    },
    {
      group: '团队协作', title: '会议议程', desc: '创建会议议程', icon: <I.IconAgenda size={16} />,
      keywords: ['agenda', 'meeting', 'hyyc', 'huiyiyicheng', '会议'],
      command: ({ editor: e, range }) => run(e, range, () => insertMockBlock(e, 'agenda')),
    },
  ]
}

export function filterSlashItems(items: SlashItem[], query: string): SlashItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter(
    (it) =>
      it.title.toLowerCase().includes(q) ||
      it.desc.toLowerCase().includes(q) ||
      it.keywords.some((k) => k.toLowerCase().includes(q) || k.toLowerCase().startsWith(q)),
  )
}
