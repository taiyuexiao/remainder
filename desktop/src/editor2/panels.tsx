/**
 * 页面级面板集合：历史版本、模版选择、评论列表、查找替换
 */
import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import {
  listSnapshots, type Snapshot,
  listComments, updateComment, deleteComment, saveDocContent,
} from './store'
import { findReplaceKey } from './findReplace'
import { markdownToTiptapJSON } from './mdPaste'
import { formatDate } from './store'
import * as I from './icons'

/* ---------- 历史版本 ---------- */

function jsonToText(json: string): string {
  try {
    const out: string[] = []
    const walk = (n: { text?: string; content?: Array<never> }) => {
      if ((n as { text?: string }).text) out.push((n as { text: string }).text)
      ;((n as { content?: unknown[] }).content ?? []).forEach((c) => walk(c as never))
    }
    walk(JSON.parse(json) as never)
    return out.join('')
  } catch {
    return ''
  }
}

export function HistoryDialog({ docId, editor, onClose }: {
  docId: string
  editor: Editor
  onClose: () => void
}) {
  const [snaps, setSnaps] = useState<Snapshot[]>(() => listSnapshots(docId))
  const [selected, setSelected] = useState<Snapshot | null>(null)

  const restore = () => {
    if (!selected) return
    try {
      const json = JSON.parse(selected.json)
      editor.commands.setContent(json)
      saveDocContent(docId, selected.json, { snapshot: true })
      window.dispatchEvent(new CustomEvent('fe-toast', { detail: '已恢复到所选版本（当前内容已存为最新快照）' }))
      setSnaps(listSnapshots(docId))
      onClose()
    } catch {
      window.dispatchEvent(new CustomEvent('fe-toast', { detail: '恢复失败：快照数据损坏' }))
    }
  }

  return (
    <div className="fe-autofmt-mask" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="fe-autofmt">
        <div className="fe-autofmt-head">
          <span className="ic"><I.IconHistory size={14} /></span>
          <span className="t">历史版本</span>
          <button className="fe-autofmt-close" onClick={onClose}><I.IconClose size={14} /></button>
        </div>
        <div className="fe-autofmt-body">
          <div className="fe-autofmt-summary">每次保存自动留存快照（最多 50 份）。恢复前当前内容会先存为快照，可再撤销回来。</div>
          {snaps.length === 0 && <div className="fe-autofmt-none">还没有历史快照，编辑文档后会自动生成</div>}
          <div className="fe-autofmt-list">
            {snaps.map((s, i) => (
              <div key={s.ts} className={`fe-hist-item ${selected?.ts === s.ts ? 'on' : ''}`} onClick={() => setSelected(s)}>
                <span className="t">{formatDate(s.ts)}</span>
                <span className="d">{s.title || '无标题文档'}</span>
                <span className="c">{s.chars} 块</span>
                {i === 0 && <span className="lv">最新</span>}
              </div>
            ))}
          </div>
          {selected && (
            <div className="fe-hist-preview">{jsonToText(selected.json).slice(0, 300) || '（空文档）'}</div>
          )}
          <div className="fe-autofmt-foot">
            <span className="flex1" />
            <button className="fe-ai-btn ghost" onClick={onClose}>取消</button>
            <button className="fe-ai-btn primary" disabled={!selected} style={{ opacity: selected ? 1 : 0.5 }} onClick={restore}>恢复到此版本</button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------- 模版选择 ---------- */

const TEMPLATES: Array<{ key: string; name: string; desc: string; md: string }> = [
  {
    key: 'meeting',
    name: '会议纪要',
    desc: '结论 / 待办 / 责任人',
    md: [
      '# 会议纪要',
      '',
      '**时间：**  ',
      '**参会人：** @张伟 @李娜',
      '',
      '## 一、会议结论',
      '- ',
      '- ',
      '',
      '## 二、待办事项',
      '- [ ] 任务一（负责人：@张伟，截止：）',
      '- [ ] 任务二（负责人：@李娜，截止：）',
      '',
      '## 三、遗留问题',
      '- ',
    ].join('\n'),
  },
  {
    key: 'weekly',
    name: '项目周报',
    desc: '进展 / 风险 / 下周计划',
    md: [
      '# 项目周报',
      '',
      '## 本周进展',
      '- **模块 A：**',
      '- **模块 B：**',
      '',
      '## 风险与求助',
      '- ',
      '',
      '## 下周计划',
      '- [ ] ',
      '- [ ] ',
    ].join('\n'),
  },
  {
    key: 'prd',
    name: '产品需求文档',
    desc: '背景 / 方案 / 验收标准',
    md: [
      '# 产品需求文档（PRD）',
      '',
      '## 一、背景与目标',
      '',
      '## 二、功能方案',
      '### 2.1 功能点',
      '',
      '### 2.2 交互说明',
      '',
      '## 三、验收标准',
      '- [ ] ',
      '- [ ] ',
      '',
      '## 四、埋点与数据',
      '- ',
    ].join('\n'),
  },
]

export function TemplatePicker({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const apply = (md: string) => {
    const json = markdownToTiptapJSON(md)
    editor.chain().focus().insertContent(json.content ?? []).run()
    onClose()
  }
  return (
    <div className="fe-autofmt-mask" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="fe-autofmt fe-tpl">
        <div className="fe-autofmt-head">
          <span className="ic"><I.IconTemplate size={14} /></span>
          <span className="t">从模版插入</span>
          <button className="fe-autofmt-close" onClick={onClose}><I.IconClose size={14} /></button>
        </div>
        <div className="fe-autofmt-body">
          <div className="fe-tpl-grid">
            {TEMPLATES.map((t) => (
              <div key={t.key} className="fe-tpl-card" onClick={() => apply(t.md)}>
                <div className="t">{t.name}</div>
                <div className="d">{t.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------- 评论列表 ---------- */

export function CommentsPanel({ docId, editor, onClose }: {
  docId: string
  editor: Editor
  onClose: () => void
}) {
  const [, force] = useForce()
  const comments = listComments(docId)
  const open = comments.filter((c) => !c.resolved)
  const resolved = comments.filter((c) => c.resolved)

  const jump = (commentId: string) => {
    try {
      let pos = -1
      editor.state.doc.descendants((node, p) => {
        if (pos >= 0) return false
        if (node.marks.some((m) => m.type.name === 'comment' && m.attrs.commentId === commentId)) pos = p
        return pos < 0
      })
      if (pos >= 0) {
        const dom = editor.view.domAtPos(pos + 1)
        const el = dom.node instanceof Element ? dom.node : dom.node.parentElement
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    } catch { /* ignore */ }
  }

  const resolve = (id: string) => {
    updateComment(docId, id, { resolved: true })
    editor.commands.removeCommentMarkById(id)
    force()
  }

  const remove = (id: string) => {
    deleteComment(docId, id)
    editor.commands.removeCommentMarkById(id)
    force()
  }

  return (
    <div className="fe-comments-panel">
      <div className="fe-comments-head">
        <span className="t">评论 <span className="n">{open.length}</span></span>
        <button className="fe-ai-dock-close" onClick={onClose}><I.IconClose size={13} /></button>
      </div>
      <div className="fe-comments-body">
        {comments.length === 0 && <div className="fe-comments-empty">选中文字后点击浮动工具栏「评论」开始讨论</div>}
        {open.map((c) => (
          <div key={c.id} className="fe-comment-item" onClick={() => jump(c.id)}>
            <div className="q">「{c.quote.slice(0, 40)}{c.quote.length > 40 ? '…' : ''}」</div>
            <div className="tx">{c.text}</div>
            <div className="ops">
              <span className="time">{formatDate(c.createdAt)}</span>
              <span className="flex1" />
              <button onClick={(e) => { e.stopPropagation(); resolve(c.id) }}>解决</button>
              <button onClick={(e) => { e.stopPropagation(); remove(c.id) }}>删除</button>
            </div>
          </div>
        ))}
        {resolved.length > 0 && <div className="fe-comments-sub">已解决</div>}
        {resolved.map((c) => (
          <div key={c.id} className="fe-comment-item resolved" onClick={() => jump(c.id)}>
            <div className="q">「{c.quote.slice(0, 40)}」</div>
            <div className="tx">{c.text}</div>
            <div className="ops">
              <span className="time">{formatDate(c.createdAt)}</span>
              <span className="flex1" />
              <button onClick={(e) => { e.stopPropagation(); remove(c.id) }}>删除</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function useForce(): [number, () => void] {
  const [n, setN] = useState(0)
  return [n, () => setN((v) => v + 1)]
}

/* ---------- 查找替换 ---------- */

export function FindReplacePanel({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [, force] = useForce()
  const [search, setSearch] = useState('')
  const [replace, setReplace] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    const fn = () => force()
    editor.on('transaction', fn)
    return () => { editor.off('transaction', fn) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  const state = findReplaceKey.getState(editor.state)

  const close = () => {
    editor.commands.findSet('')
    onClose()
  }

  return (
    <div className="fe-find-panel">
      <div className="row">
        <input
          ref={inputRef}
          placeholder="查找内容"
          value={search}
          onChange={(e) => { setSearch(e.target.value); editor.commands.findSet(e.target.value) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); editor.commands.findGoto(e.shiftKey ? -1 : 1) }
            if (e.key === 'Escape') close()
            e.stopPropagation()
          }}
        />
        <span className="count">{state?.matches.length ? `${state.index + 1}/${state.matches.length}` : search ? '0' : ''}</span>
        <button title="上一个 (Shift+Enter)" onClick={() => editor.commands.findGoto(-1)}>↑</button>
        <button title="下一个 (Enter)" onClick={() => editor.commands.findGoto(1)}>↓</button>
        <button title="关闭 (Esc)" onClick={close}><I.IconClose size={12} /></button>
      </div>
      <div className="row">
        <input
          placeholder="替换为（留空则删除）"
          value={replace}
          onChange={(e) => setReplace(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); editor.commands.findReplaceOne(replace); force() }
            e.stopPropagation()
          }}
        />
        <button onClick={() => { editor.commands.findReplaceOne(replace); force() }}>替换</button>
        <button onClick={() => { editor.commands.findReplaceAll(replace); force() }}>全部替换</button>
      </div>
    </div>
  )
}
