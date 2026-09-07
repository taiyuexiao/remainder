/**
 * 错别字批处理（M18 回植 feishu-clone 内核 / M29）：全文扫描 → 面板清单 → 应用选中/全部
 * 流式纠错开关在 remainder 旧编辑器里耦合较深，本期只回植批处理通道。
 */
import { useState } from 'react'
import type { Editor } from '@tiptap/core'
import { api, type TypoIssue } from '../api/client'
import { ToolbarBtn } from './ToolbarBtns'
import * as I from './icons'

/** 在文档中定位并应用单条错别字修正（沿用 M18 逻辑：优先 context 锚点） */
function applyOneTypo(editor: Editor, issue: TypoIssue) {
  let done = false
  editor.state.doc.descendants((node, pos) => {
    if (done || !node.isTextblock) return false
    const text = node.textContent
    const ctx = issue.context || issue.before
    const ci = text.indexOf(ctx)
    let idx = ci >= 0 ? text.indexOf(issue.before, ci) : -1
    if (idx < 0) idx = text.indexOf(issue.before)
    if (idx < 0) return false
    const from = pos + 1 + idx
    editor.chain().insertContentAt({ from, to: from + issue.before.length }, issue.after).run()
    done = true
    return false
  })
}

export function TypoCheck({ editor }: { editor: Editor }) {
  const [checking, setChecking] = useState(false)
  const [issues, setIssues] = useState<TypoIssue[] | null>(null)
  const [checked, setChecked] = useState<boolean[]>([])

  const run = async () => {
    if (checking) return
    setChecking(true)
    try {
      const { issues: list } = await api.checkTypos(editor.getText({ blockSeparator: '\n' }))
      if (!list.length) {
        slashToast('未发现错别字 ✓')
        return
      }
      setIssues(list)
      setChecked(list.map(() => true))
    } catch (e) {
      slashToast((e as Error).message)
    } finally {
      setChecking(false)
    }
  }

  const apply = (forceAll: boolean) => {
    if (!issues) return
    issues.forEach((issue, i) => {
      if (forceAll || checked[i]) applyOneTypo(editor, issue)
    })
    setIssues(null)
  }

  return (
    <>
      <ToolbarBtn
        icon={<I.IconChecklist size={15} />}
        tip="错别字检查"
        on={checking}
        onClick={() => void run()}
      />
      {issues && (
        <div className="fe-find-replace" style={{ width: 340 }}>
          <div className="fe-panel-head">
            <span>错别字（{issues.length}）</span>
            <button className="fe-icon-btn" onClick={() => setIssues(null)}><I.IconClose size={14} /></button>
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto', padding: '4px 8px' }}>
            {issues.map((it, i) => (
              <label key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '5px 4px', fontSize: 13, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={checked[i]}
                  onChange={() => setChecked((prev) => prev.map((v, j) => (j === i ? !v : v)))}
                />
                <span>
                  <s style={{ color: '#F54A45' }}>{it.before}</s>
                  <span style={{ color: '#34A853', margin: '0 4px' }}>→ {it.after}</span>
                  {it.context && <span style={{ color: '#8F959E', fontSize: 12 }}>（{it.context}）</span>}
                </span>
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: 8, borderTop: '1px solid var(--border-1, #EFF0F1)' }}>
            <button className="fe-btn-primary" style={{ height: 28 }} onClick={() => apply(false)}>应用选中</button>
            <button className="fe-btn-primary" style={{ height: 28, background: 'var(--bg-2)', color: 'var(--text-2)' }} onClick={() => apply(true)}>全部应用</button>
          </div>
        </div>
      )}
    </>
  )
}

function slashToast(msg: string) {
  window.dispatchEvent(new CustomEvent('fe-toast', { detail: msg }))
}
