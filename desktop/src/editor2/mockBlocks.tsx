/**
 * 演示占位块（Mock Block）—— 斜杠菜单中飞书已提供、但本项目尚未实现的重量级块
 * （同步块/视频或文件/模版/分栏/公式/人员/群名片/云文档/任务清单/投票/日期提醒/信息收集/日程/会议议程）
 * 统一渲染为"图标 + 名称 + 空态说明"的卡片，保证菜单条目与飞书一致且点击有反馈；
 * 后续版本用真实实现逐个替换。
 */
import { Node, mergeAttributes, type CommandProps } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import * as I from './icons'
import type { ReactNode } from 'react'

export type MockKind =
  | 'sync'
  | 'media'
  | 'template'
  | 'column'
  | 'formula'
  | 'user'
  | 'group'
  | 'doc'
  | 'checklist'
  | 'vote'
  | 'reminder'
  | 'collect'
  | 'calendar'
  | 'agenda'

export const MOCK_META: Record<MockKind, { label: string; desc: string; icon: (s?: number) => ReactNode }> = {
  sync: { label: '同步块', desc: '创建可多文档同步的内容块', icon: (s) => <I.IconSync size={s ?? 16} /> },
  media: { label: '视频或文件', desc: '上传视频或添加附件', icon: (s) => <I.IconFileMedia size={s ?? 16} /> },
  template: { label: '模版', desc: '从模版库快速插入内容', icon: (s) => <I.IconTemplate size={s ?? 16} /> },
  column: { label: '分栏', desc: '并排组织多栏内容', icon: (s) => <I.IconColumns size={s ?? 16} /> },
  formula: { label: '公式', desc: '插入数学公式（支持上下标）', icon: (s) => <I.IconFormula size={s ?? 16} /> },
  user: { label: '人员', desc: '提及一位协作者', icon: (s) => <I.IconAvatar size={s ?? 16} /> },
  group: { label: '群名片', desc: '分享一个飞书群', icon: (s) => <I.IconUsers size={s ?? 16} /> },
  doc: { label: '云文档', desc: '嵌入一篇云文档', icon: (s) => <I.IconDoc size={s ?? 16} /> },
  checklist: { label: '任务清单', desc: '插入结构化任务清单', icon: (s) => <I.IconChecklist size={s ?? 16} /> },
  vote: { label: '投票', desc: '发起投票收集意见', icon: (s) => <I.IconVote size={s ?? 16} /> },
  reminder: { label: '日期提醒', desc: '插入日期并设置提醒', icon: (s) => <I.IconBell size={s ?? 16} /> },
  collect: { label: '信息收集', desc: '收集表单信息', icon: (s) => <I.IconClipboard size={s ?? 16} /> },
  calendar: { label: '日程', desc: '插入日程邀请', icon: (s) => <I.IconCalendar size={s ?? 16} /> },
  agenda: { label: '会议议程', desc: '创建会议议程', icon: (s) => <I.IconAgenda size={s ?? 16} /> },
}

function MockCardView({ node, selected }: NodeViewProps) {
  const kind = (node.attrs.kind as MockKind) || 'sync'
  const meta = MOCK_META[kind] ?? MOCK_META.sync
  return (
    <NodeViewWrapper className="fe-mock-wrap" data-selected={selected ? 'true' : undefined}>
      <div className="fe-mock-card" contentEditable={false}>
        <span className="fe-mock-icon">{meta.icon(20)}</span>
        <span className="fe-mock-body">
          <span className="t">{meta.label}</span>
          <span className="d">{meta.desc} · 演示占位，后续版本接入完整能力</span>
        </span>
      </div>
    </NodeViewWrapper>
  )
}

export const MockBlock = Node.create({
  name: 'mockBlock',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      kind: {
        default: 'sync',
        parseHTML: (el) => el.getAttribute('data-mock-kind') || 'sync',
        renderHTML: (attrs) => ({ 'data-mock-kind': attrs.kind }),
      },
      label: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-mock-label') || '',
        renderHTML: (attrs) => (attrs.label ? { 'data-mock-label': attrs.label } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-mock-kind]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'mock-block' })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(MockCardView)
  },

  addCommands() {
    return {
      insertMock:
        (kind: MockKind) =>
        ({ chain }: CommandProps) =>
          chain().focus().insertContent({ type: 'mockBlock', attrs: { kind, label: MOCK_META[kind]?.label ?? '' } }).run(),
    }
  },
})

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mockBlock: {
      insertMock: (kind: MockKind) => ReturnType
    }
  }
}

/** 斜杠菜单调用入口：在光标处插入占位卡片 */
export function insertMockBlock(editor: import('@tiptap/core').Editor, kind: MockKind) {
  editor.chain().focus().insertMock(kind).run()
}
