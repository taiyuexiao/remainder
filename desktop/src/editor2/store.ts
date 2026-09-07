/**
 * feishu-clone store 兼容层（M29）：同 API 面，后端换 remainder server + localStorage。
 * - 文档内容/标题 ↔ remainder documents API（EditorShell 先 primeDoc 再渲染 EditorPage，同步 API 不破）
 * - meta 扩展字段（starred/icon/cover/width）/ 快照 / 划线评论：localStorage（KISS，后续可接 server）
 */
import { api } from '../api/client'

export interface DocMeta {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  starred: boolean
  deleted: boolean
  icon?: string
  cover?: string
  folderId?: string | null
  width?: 'std' | 'wide'
}

export interface Snapshot {
  ts: number
  title: string
  json: string
  chars: number
}

export interface CommentItem {
  id: string
  text: string
  quote: string
  resolved: boolean
  createdAt: number
}

const contents = new Map<string, string>()
const metas = new Map<string, DocMeta>()

const LS_META = 'fe-meta:'
const LS_SNAPS = 'fe-snaps:'
const LS_COMMENTS = 'fe-comments:'

function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function lsSet(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 超容量时静默（快照/评论非关键数据） */
  }
}

/* ---------- 文档（server 后端） ---------- */

/** EditorShell 渲染 EditorPage 前调用：把 server 文档灌入同步缓存 */
export async function primeDoc(docId: string): Promise<DocMeta | undefined> {
  try {
    const doc = await api.getDocument(docId)
    const extra = lsGet<Partial<DocMeta>>(LS_META + docId, {})
    const meta: DocMeta = {
      id: doc.id,
      title: doc.title,
      createdAt: new Date(doc.created_at).getTime(),
      updatedAt: new Date(doc.updated_at).getTime(),
      starred: extra.starred ?? false,
      deleted: false,
      icon: extra.icon,
      cover: extra.cover,
      folderId: doc.folder_id ?? null,
      width: extra.width,
    }
    metas.set(docId, meta)
    contents.set(docId, doc.content || '')
    return meta
  } catch {
    return undefined
  }
}

export function getDocMeta(id: string): DocMeta | undefined {
  return metas.get(id)
}

export function getDocContent(id: string): string | null {
  return contents.get(id) ?? null
}

export function defaultContent() {
  return { type: 'doc', content: [{ type: 'paragraph' }] }
}

export function saveDocContent(id: string, json: string, opts?: { snapshot?: boolean }) {
  contents.set(id, json)
  void api.updateDocument(id, { content: json }).catch(() => {})
  if (opts?.snapshot) pushSnapshot(id, json)
  const m = metas.get(id)
  if (m) {
    m.updatedAt = Date.now()
    persistMeta(m)
  }
}

function persistMeta(m: DocMeta) {
  lsSet(LS_META + m.id, { starred: m.starred, icon: m.icon, cover: m.cover, width: m.width })
}

export function updateMeta(id: string, patch: Partial<DocMeta>): DocMeta {
  const m = metas.get(id) ?? {
    id, title: '', createdAt: Date.now(), updatedAt: Date.now(), starred: false, deleted: false,
  }
  Object.assign(m, patch, { updatedAt: Date.now() })
  metas.set(id, m)
  persistMeta(m)
  if (patch.title !== undefined) void api.updateDocument(id, { title: patch.title }).catch(() => {})
  return m
}

export function toggleStar(id: string): boolean {
  const m = metas.get(id)
  if (!m) return false
  m.starred = !m.starred
  persistMeta(m)
  return m.starred
}

export function moveToTrash(id: string) {
  // remainder 的删除在文档树侧做真删除；编辑器内删除即真删
  void api.deleteDocument(id).catch(() => {})
  metas.delete(id)
  contents.delete(id)
}

/** 文档副本：先生成临时 id 乐观返回，server 建好后重映射缓存并跳转 */
export function createDoc(): DocMeta {
  const tempId = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const meta: DocMeta = { id: tempId, title: '无标题文档', createdAt: Date.now(), updatedAt: Date.now(), starred: false, deleted: false }
  metas.set(tempId, meta)
  void api.createDocument({ title: meta.title, content: JSON.stringify(defaultContent()) }).then((doc) => {
    const c = contents.get(tempId)
    metas.delete(tempId)
    contents.delete(tempId)
    contents.set(doc.id, c ?? JSON.stringify(defaultContent()))
    void primeDoc(doc.id)
    window.dispatchEvent(new CustomEvent('fe-doc-created', { detail: { tempId, realId: doc.id } }))
  }).catch(() => {})
  return meta
}

/* ---------- 快照（localStorage，上限 50 去重） ---------- */

export function listSnapshots(docId: string): Snapshot[] {
  return lsGet<Snapshot[]>(LS_SNAPS + docId, [])
}

export function pushSnapshot(docId: string, json: string) {
  const meta = metas.get(docId)
  const snaps = listSnapshots(docId)
  const last = snaps[snaps.length - 1]
  if (last && last.json === json) return
  snaps.push({ ts: Date.now(), title: meta?.title ?? '', json, chars: json.length })
  while (snaps.length > 50) snaps.shift()
  lsSet(LS_SNAPS + docId, snaps)
}

/* ---------- 划线评论（localStorage） ---------- */

export function listComments(docId: string): CommentItem[] {
  return lsGet<CommentItem[]>(LS_COMMENTS + docId, [])
}

export function addComment(docId: string, text: string, quote: string): CommentItem {
  const item: CommentItem = { id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, text, quote, resolved: false, createdAt: Date.now() }
  lsSet(LS_COMMENTS + docId, [...listComments(docId), item])
  return item
}

export function updateComment(docId: string, id: string, patch: Partial<CommentItem>) {
  lsSet(LS_COMMENTS + docId, listComments(docId).map((c) => (c.id === id ? { ...c, ...patch } : c)))
}

export function deleteComment(docId: string, id: string) {
  lsSet(LS_COMMENTS + docId, listComments(docId).filter((c) => c.id !== id))
}

/* ---------- 工具 ---------- */

export function formatDate(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
