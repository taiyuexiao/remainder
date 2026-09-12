/**
 * 文档编辑页 — 设计规范 v2
 * TopBar + 工具栏 + 正文（图标/封面/宽度） + 左侧大纲 + 右侧 AI/评论栏
 * 数据：IndexedDB（store v2），500ms 防抖保存 + 自动快照
 * 浮层：AI 侧栏 / 评论 / 历史 / 查找替换 / 模版 / 分享 / Toast
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import type { Editor } from '@tiptap/core'
import { Toolbar } from './Toolbar'
import { BubbleToolbar } from './BubbleToolbar'
import { BlockHandle } from './BlockHandle'
import { OutlinePanel } from './OutlinePanel'
import { SharePopover } from './SharePopover'
import { Dropdown } from './Dropdown'
import { api } from '../api/client'
import { AISidebar } from './ai/AISidebar'
import { AutoFormatDialog } from './ai/AutoFormat'
import { HistoryDialog, TemplatePicker, CommentsPanel, FindReplacePanel } from './panels'
import { slashHelpers, type AIOpenOptions } from './slashHelpers'
import { currentTopBlockIndex } from './blockOps'
import { buildExtensions, editorPropsForPaste } from './extensions'
import {
  getDocMeta, getDocContent, saveDocContent, updateMeta, toggleStar, moveToTrash, defaultContent, createDoc,
  type DocMeta,
} from './store'
import * as I from './icons'

type SaveStatus = 'saved' | 'saving'
type Mode = 'edit' | 'read'

const COVER_PRESETS = [
  'linear-gradient(135deg,#3370FF,#7F3BF5)',
  'linear-gradient(135deg,#FF8800,#F54A45)',
  'linear-gradient(135deg,#34A853,#3370FF)',
  'linear-gradient(135deg,#F5319D,#7F3BF5)',
  'linear-gradient(135deg,#FAAD14,#FF8800)',
  'linear-gradient(160deg,#1F2329,#646A73)',
  'linear-gradient(135deg,#00C6BE,#3370FF)',
  'linear-gradient(135deg,#8F959E,#3370FF)',
]

const ICON_PRESETS = ['📄','📘','🚀','💡','📌','📊','✅','🎯','🔥','🌟','🧪','🛠️','📈','🗂️','💬','🎨','☕','🌱','⚡','🧩','📅','🔗','🐣','🏆']

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function parseStoredContent(docId: string) {
  const raw = getDocContent(docId)
  if (raw) {
    try {
      return JSON.parse(raw)
    } catch {
      // 非 JSON 内容（剪藏转换的 HTML / 纯文本）：原样交给 Tiptap 解析，绝不回退空文档（M29 血训）
      return raw
    }
  }
  return defaultContent()
}

export default function EditorPage({ docId, onBack }: { docId: string; onBack: () => void }) {
  const [meta, setMeta] = useState<DocMeta | undefined>(() => getDocMeta(docId))
  const [title, setTitle] = useState(meta?.title ?? '')
  const [starred, setStarred] = useState(meta?.starred ?? false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [shareOpen, setShareOpen] = useState(false)
  const [outlineOpen, setOutlineOpen] = useState(true)
  const [mode, setMode] = useState<Mode>('edit')
  const [linkCopied, setLinkCopied] = useState(false)
  const [ai, setAI] = useState<{ open: boolean; seed: AIOpenOptions & { context?: string } }>({ open: false, seed: {} })
  const [toast, setToast] = useState<{ id: number; msg: string } | null>(null)
  const [iconPickerOpen, setIconPickerOpen] = useState(false)
  const [coverPickerOpen, setCoverPickerOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [tplOpen, setTplOpen] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [findOpen, setFindOpen] = useState(false)
  const [fmtOpen, setFmtOpen] = useState(false)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  // 脏标记：仅真正编辑过才落盘（防“解析失败→空编辑器→卸载时误覆盖原文”）
  const dirtyRef = useRef(false)

  const editor = useEditor({
    extensions: buildExtensions(),
    content: parseStoredContent(docId),
    autofocus: false,
    editorProps: editorPropsForPaste(readFileAsDataURL, async (id) => (await api.getDocument(id)).title),
    onUpdate: () => setSaveStatus('saving'),
  }, [docId])

  const titleSyncRef = useRef(title)
  useEffect(() => {
    titleSyncRef.current = title
  }, [title])

  // 开发调试句柄（生产无副作用）
  useEffect(() => {
    if (editor) (window as unknown as Record<string, unknown>).__feEditor = editor
  }, [editor])

  /* ---------- 全局 Toast ---------- */
  const showToast = useCallback((msg: string) => {
    setToast({ id: Date.now(), msg })
  }, [])
  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 2200)
    return () => window.clearTimeout(t)
  }, [toast])
  useEffect(() => {
    const onToast = (e: Event) => showToast((e as CustomEvent<string>).detail)
    window.addEventListener('fe-toast', onToast)
    return () => window.removeEventListener('fe-toast', onToast)
  }, [showToast])

  /* ---------- 菜单/浮条与页面能力对接 ---------- */
  useEffect(() => {
    if (!editor) return
    slashHelpers.openAI = (ed: Editor, opts?: AIOpenOptions) => {
      let context = ''
      try {
        const { from, to, empty } = ed.state.selection
        context = !empty && to > from
          ? ed.state.doc.textBetween(from, to, '\n')
          : ed.state.doc.child(currentTopBlockIndex(ed))?.textContent ?? ''
      } catch {
        /* 光标异常时保持空上下文 */
      }
      setAI({ open: true, seed: { prompt: opts?.prompt, quick: opts?.quick, context: context.trim() } })
    }
    slashHelpers.toast = showToast
    slashHelpers.openTemplates = () => setTplOpen(true)
    slashHelpers.docId = () => docId
    slashHelpers.duplicateDoc = () => {
      const created = createDoc()
      const content = editor ? JSON.stringify(editor.getJSON()) : getDocContent(docId)
      if (content) saveDocContent(created.id, content)
      updateMeta(created.id, { title: `${titleSyncRef.current || '无标题文档'} 副本` })
      window.location.hash = `#/doc/${created.id}`
      showToast('已创建文档副本')
    }
  }, [editor, docId, showToast])

  /* ---------- 自动保存（含自动快照，内容不变时快照自动去重） ---------- */
  const doSave = useCallback(() => {
    if (!editor || !dirtyRef.current) return
    dirtyRef.current = false
    const json = JSON.stringify(editor.getJSON())
    saveDocContent(docId, json, { snapshot: true })
    updateMeta(docId, { title: titleSyncRef.current })
    setSaveStatus('saved')
  }, [editor, docId])

  useEffect(() => {
    if (!editor) return
    const timer = { id: 0 }
    const schedule = () => {
      dirtyRef.current = true
      setSaveStatus('saving')
      window.clearTimeout(timer.id)
      timer.id = window.setTimeout(doSave, 500)
    }
    editor.on('update', schedule)
    const onLeave = () => doSave()
    window.addEventListener('beforeunload', onLeave)
    return () => {
      editor.off('update', schedule)
      window.removeEventListener('beforeunload', onLeave)
      window.clearTimeout(timer.id)
      doSave()
    }
  }, [editor, doSave])

  /* ---------- 标题防抖写入 ---------- */
  const firstTitle = useRef(true)
  useEffect(() => {
    if (firstTitle.current) { firstTitle.current = false; return }
    setSaveStatus('saving')
    const t = window.setTimeout(() => {
      updateMeta(docId, { title })
      setSaveStatus('saved')
    }, 500)
    return () => window.clearTimeout(t)
  }, [title, docId])

  /* ---------- 编辑 / 阅读模式（阅读态按 E 进入编辑） ---------- */
  useEffect(() => {
    if (!editor) return
    editor.setEditable(mode === 'edit')
    editor.view.dispatch(editor.state.tr)
  }, [editor, mode])

  useEffect(() => {
    if (mode !== 'read') return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      if (e.key === 'e' || e.key === 'E') setMode('edit')
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mode])

  /* ---------- 查找替换：⌘F / ⌘⇧H ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F') && !e.shiftKey) {
        e.preventDefault()
        setFindOpen(true)
      }
      if ((e.metaKey || e.ctrlKey) && ((e.key === 'h' || e.key === 'H') || (e.key === 'f' && e.shiftKey))) {
        e.preventDefault()
        setFindOpen(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  /* ---------- 点击评论高亮 → 打开评论面板 ---------- */
  useEffect(() => {
    if (!editor) return
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest('[data-comment-id]')
      if (el) setCommentsOpen(true)
    }
    editor.view.dom.addEventListener('click', onClick)
    return () => editor.view.dom.removeEventListener('click', onClick)
  }, [editor])

  /* ---------- 新建空文档自动聚焦标题 ---------- */
  useEffect(() => {
    if (!meta?.title) titleRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---------- 标题高度自适应 ---------- */
  useEffect(() => {
    const el = titleRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
  }, [title])

  const onStar = () => {
    const next = toggleStar(docId)
    setStarred(next)
  }

  const onCopyLink = async () => {
    try { await navigator.clipboard.writeText(window.location.href) } catch { /* ignore */ }
    setLinkCopied(true)
    window.setTimeout(() => setLinkCopied(false), 1500)
  }

  const onTrash = () => {
    moveToTrash(docId)
    onBack()
  }

  const patchMeta = (patch: Partial<DocMeta>) => {
    setMeta(updateMeta(docId, patch))
  }

  const wide = meta?.width === 'wide'

  return (
    <div className="fe-editor-page">
      {/* ============ TopBar 56px ============ */}
      <header className="fe-topbar">
        <div className="fe-topbar-left">
          <button className="fe-topbar-icon-btn" title="返回" onClick={onBack}>
            <I.IconBack size={18} />
          </button>
          <span className="fe-doc-badge"><I.IconDoc size={16} /></span>
          <span className="fe-topbar-title" title={title || '无标题文档'}>
            {title || '无标题文档'}
          </span>
          <button
            className={`fe-topbar-icon-btn star ${starred ? 'on' : ''}`}
            title={starred ? '取消收藏' : '收藏'}
            onClick={onStar}
          >
            <I.IconStar size={16} filled={starred} />
          </button>
          <span className="fe-save-status">{saveStatus === 'saving' ? '保存中…' : '已保存'}</span>
        </div>

        <div className="fe-topbar-right">
          <div className="fe-avatar-group" title="协作者">
            <span className="fe-avatar fe-avatar-sm" style={{ background: 'linear-gradient(135deg,#3370FF,#7F3BF5)' }}>我</span>
            <span className="fe-avatar fe-avatar-sm" style={{ background: 'linear-gradient(135deg,#FF8800,#F54A45)' }}>张</span>
            <span className="fe-avatar fe-avatar-sm" style={{ background: 'linear-gradient(135deg,#34A853,#3370FF)' }}>李</span>
          </div>

          {/* 评论入口 */}
          <button className={`fe-topbar-icon-btn ${commentsOpen ? 'on' : ''}`} title="评论" onClick={() => setCommentsOpen((v) => !v)}>
            <I.IconComment size={16} />
          </button>

          {/* 历史记录 */}
          <button className="fe-topbar-icon-btn" title="历史记录" onClick={() => setHistoryOpen(true)}>
            <I.IconHistory size={16} />
          </button>

          <button className="fe-btn-primary fe-share-btn" onClick={() => setShareOpen(true)}>
            分&nbsp;&nbsp;享
          </button>

          {/* 更多 */}
          <Dropdown align="right" button={({ open }) => (
            <button className={`fe-topbar-icon-btn ${open ? 'on' : ''}`} title="更多"><I.IconMore size={16} /></button>
          )}>
            {(close) => (
              <div className="fe-menu" style={{ width: 210 }}>
                <div className="fe-mi" onClick={() => { setOutlineOpen((v) => !v); close() }}>
                  <I.IconList size={15} /><span>大纲</span>
                  <span className="fe-mi-state">{outlineOpen ? '已开启' : '已关闭'}</span>
                </div>
                <div className="fe-mi" onClick={() => { setMode(mode === 'edit' ? 'read' : 'edit'); close() }}>
                  {mode === 'edit' ? <I.IconEye size={15} /> : <I.IconPencil size={15} />}
                  <span>{mode === 'edit' ? '切换到阅读模式' : '切换到编辑模式'}</span>
                </div>
                <div className="fe-mi" onClick={() => { patchMeta({ width: wide ? 'std' : 'wide' }); close() }}>
                  <I.IconColumns size={15} /><span>页面宽度</span>
                  <span className="fe-mi-state">{wide ? '宽' : '标准'}</span>
                </div>
                <div className="fe-mi" onClick={() => {
                  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
                  document.documentElement.setAttribute('data-theme', next)
                  localStorage.setItem('feishu-clone:theme', next)
                  close()
                }}>
                  <I.IconEye size={15} /><span>外观</span>
                  <span className="fe-mi-state">{document.documentElement.getAttribute('data-theme') === 'dark' ? '深色' : '浅色'}</span>
                </div>
                <div className="fe-mi" onClick={() => { setFindOpen(true); close() }}>
                  <I.IconSearch size={15} /><span>查找与替换</span>
                  <span className="fe-mi-state">⌘F</span>
                </div>
                <div className="fe-mi" onClick={() => { window.print(); close() }}>
                  <I.IconDownload size={15} /><span>打印 / 导出 PDF</span>
                </div>
                <div className="fe-mi" onClick={() => {
                  void api.exportDocument(docId)
                    .then((r) => showToast(`已导出：${r.path}`))
                    .catch((e) => showToast(`导出失败：${(e as Error).message}`))
                  close()
                }}>
                  <I.IconDownload size={15} /><span>导出 Markdown</span>
                </div>
                <div className="fe-mi" onClick={() => { onCopyLink(); close() }}>
                  <I.IconLink size={15} /><span>{linkCopied ? '链接已复制' : '复制链接'}</span>
                </div>
                <div className="fe-menu-sep" />
                <div className="fe-mi danger" onClick={() => { onTrash(); close() }}>
                  <I.IconTrash size={15} /><span>移到回收站</span>
                </div>
              </div>
            )}
          </Dropdown>

          <span className="fe-topbar-vsep" />

          <button
            className={`fe-mode-btn ${mode === 'read' ? 'primary' : ''}`}
            title={mode === 'edit' ? '切换到阅读模式' : '切换到编辑模式'}
            onClick={() => setMode(mode === 'edit' ? 'read' : 'edit')}
          >
            {mode === 'edit' ? <><I.IconEye size={14} /> 阅读</> : <><I.IconPencil size={14} /> 编辑</>}
          </button>
        </div>
      </header>

      {/* ============ Toolbar ============ */}
      {mode === 'edit' && editor && (
        <div className="fe-toolbar-wrap">
          <Toolbar editor={editor} onAutoFormat={() => setFmtOpen(true)} />
        </div>
      )}

      {/* ============ 主体：大纲(左) + 正文 + AI/评论(右) ============ */}
      <div className="fe-body">
        {outlineOpen && editor && <OutlinePanel editor={editor} onCollapse={() => setOutlineOpen(false)} />}
        {!outlineOpen && (
          <button className="fe-outline-rail" title="展开大纲" onClick={() => setOutlineOpen(true)}>
            <I.IconList size={14} />
            <span>大纲</span>
          </button>
        )}
        <div className={`fe-content ${wide ? 'wide' : ''}`}>
          {/* 封面 */}
          {meta?.cover && (
            <div className="fe-doc-cover" style={{ background: meta.cover }}>
              <div className="fe-doc-cover-ops">
                <button onClick={() => setCoverPickerOpen(true)}>更换封面</button>
                <button onClick={() => patchMeta({ cover: '' })}>移除封面</button>
              </div>
            </div>
          )}
          {/* 图标 + 装饰按钮 */}
          <div className="fe-doc-deco-row">
            {meta?.icon && <span className="fe-doc-icon">{meta.icon}</span>}
            <div className="fe-doc-deco">
              {!meta?.cover && <button onClick={() => setCoverPickerOpen(true)}>添加封面</button>}
              <button onClick={() => setIconPickerOpen(true)}>{meta?.icon ? '更换图标' : '添加图标'}</button>
            </div>
          </div>
          {iconPickerOpen && (
            <div className="fe-emoji-pop">
              {ICON_PRESETS.map((e) => (
                <button key={e} onClick={() => { patchMeta({ icon: e }); setIconPickerOpen(false) }}>{e}</button>
              ))}
              <button className="clear" onClick={() => { patchMeta({ icon: '' }); setIconPickerOpen(false) }}>移除</button>
            </div>
          )}
          {coverPickerOpen && (
            <div className="fe-emoji-pop cover">
              {COVER_PRESETS.map((c) => (
                <button key={c} className="cover-item" style={{ background: c }} onClick={() => { patchMeta({ cover: c }); setCoverPickerOpen(false) }} />
              ))}
            </div>
          )}

          <textarea
            ref={titleRef}
            className="fe-doc-title"
            placeholder="无标题文档"
            value={title}
            readOnly={mode === 'read'}
            rows={1}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                editor?.commands.focus('start')
              }
            }}
          />
          <EditorContent editor={editor} className="fe-editor" />
        </div>

        {editor && ai.open && mode === 'edit' && (
          <AISidebar editor={editor} seed={ai.seed} onClose={() => setAI((v) => ({ ...v, open: false }))} />
        )}
        {editor && commentsOpen && (
          <CommentsPanel docId={docId} editor={editor} onClose={() => setCommentsOpen(false)} />
        )}
      </div>

      {/* ============ 浮层 ============ */}
      {editor && <BubbleToolbar editor={editor} />}
      {editor && <BlockHandle editor={editor} editable={mode === 'edit'} />}
      {editor && fmtOpen && mode === 'edit' && <AutoFormatDialog editor={editor} onClose={() => setFmtOpen(false)} />}
      {editor && historyOpen && <HistoryDialog docId={docId} editor={editor} onClose={() => setHistoryOpen(false)} />}
      {editor && tplOpen && mode === 'edit' && <TemplatePicker editor={editor} onClose={() => setTplOpen(false)} />}
      {editor && findOpen && <FindReplacePanel editor={editor} onClose={() => setFindOpen(false)} />}
      {shareOpen && <SharePopover docId={docId} onClose={() => setShareOpen(false)} />}

      {toast && <div className="fe-toast" key={toast.id}>{toast.msg}</div>}
    </div>
  )
}
