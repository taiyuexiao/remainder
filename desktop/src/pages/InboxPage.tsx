import { useCallback, useEffect, useState } from 'react';
import { api, type InboxItem, type Project, type TaskType } from '../api/client';
import { useImeGuard } from '../ime';
import { IconClose, IconPencil, IconPlus } from '../components/NavIcons';

export default function InboxPage() {
  const { guard: imeGuard, compositionProps: imeProps } = useImeGuard();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [convertId, setConvertId] = useState<string | null>(null);
  const [convertType, setConvertType] = useState<TaskType>('side');
  const [convertProjectId, setConvertProjectId] = useState(''); // '' = 新建同名项目
  const [convertPerson, setConvertPerson] = useState('');
  const [convertDate, setConvertDate] = useState('');

  const reload = useCallback(async () => {
    const [inbox, ps] = await Promise.all([api.listInbox(), api.projects.list()]);
    setItems(inbox);
    setProjects(ps);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const [showNew, setShowNew] = useState(false);
  // 编辑态（M22）：非 null 时弹窗为"编辑速记"，保存走 updateInbox
  const [editItem, setEditItem] = useState<InboxItem | null>(null);

  const openNew = () => {
    setEditItem(null);
    setContent('');
    setTags('');
    setShowNew(true);
  };

  const openEdit = (it: InboxItem) => {
    setEditItem(it);
    setContent(it.content);
    setTags(it.tags);
    setShowNew(true);
  };

  const add = async () => {
    if (!content.trim()) return;
    if (editItem) {
      await api.updateInbox(editItem.id, { content: content.trim(), tags: tags.trim() });
    } else {
      await api.createInbox(content.trim(), tags.trim());
    }
    setContent('');
    setTags('');
    setShowNew(false);
    setEditItem(null);
    reload();
  };

  const remove = async (id: string) => {
    if (!confirm('确认删除这条速记？删除后不可恢复。')) return;
    await api.deleteInbox(id);
    reload();
  };

  // 沉淀到知识库（M23）：速记 → note 经验条目
  const sediment = async (it: InboxItem) => {
    try {
      await api.createKnowledge({
        type: 'note',
        title: it.content.slice(0, 50) || '速记',
        content: it.content,
        tags: it.tags ? it.tags.split(/[,，]/).map((s) => s.trim()).filter(Boolean) : [],
      });
      await api.deleteInbox(it.id);
      reload();
      alert('已沉淀到知识库（经验）');
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const convert = async (id: string) => {
    if (convertProjectId) {
      // 选了已有项目 → 转为该项目的子任务（type 由后端从项目继承）
      await api.convertInbox(id, { projectId: convertProjectId });
    } else {
      // 新建同名项目（旧逻辑）；idea 平铺
      await api.convertInbox(id, {
        type: convertType,
        person: convertType === 'follow' ? convertPerson : undefined,
        nextFollowDate: convertType === 'follow' ? convertDate : undefined,
      });
    }
    setConvertId(null);
    setConvertProjectId('');
    setConvertPerson('');
    setConvertDate('');
    reload();
  };

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 bg-white border-b border-slate-200 flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Inbox</h2>
          <p className="text-xs text-slate-400 mt-0.5">速记暂存区 · 回车快速记录，之后一键转为任务</p>
        </div>
        <button
          onClick={openNew}
          className="rounded-lg bg-[var(--brand)] text-white px-4 py-2 text-sm font-medium hover:bg-[var(--brand-hover)] shadow-sm"
        >
          ＋ 新建速记
        </button>
      </header>

      {/* 新建 / 编辑速记弹窗（M41 重做：大尺寸 + fe 设计语言） */}
      {showNew && (
        <div
          className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] flex items-center justify-center p-6"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setShowNew(false); }}
        >
          <div
            className="w-[640px] max-w-full rounded-xl bg-white shadow-2xl overflow-hidden"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* 标题栏 */}
            <div className="px-5 py-3 border-b border-[var(--border-light)] flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-md bg-[var(--brand-light)] text-[var(--brand)] flex items-center justify-center shrink-0">
                {editItem ? <IconPencil size={14} /> : <IconPlus size={14} />}
              </span>
              <h3 className="text-sm font-semibold text-[var(--text-1)]">
                {editItem ? '编辑速记' : '新建速记'}
              </h3>
              <span className="flex-1" />
              <button
                onClick={() => setShowNew(false)}
                className="w-6 h-6 rounded text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--bg-2)] flex items-center justify-center"
                title="关闭"
              >
                <IconClose size={14} />
              </button>
            </div>

            {/* 正文 + 标签 */}
            <div className="px-5 py-4">
              <textarea
                autoFocus
                rows={12}
                className="w-full rounded-lg border border-[var(--border)] px-3.5 py-3 text-sm leading-relaxed resize-y focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[rgba(51,112,255,0.15)] text-[var(--text-1)]"
                placeholder="有什么想法？写下来…（Ctrl / ⌘ + Enter 保存，Esc 关闭）"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                {...imeProps}
                onKeyDown={(e) => {
                  // macOS 中文输入法：确认候选词的回车不触发提交（含 WebKit compositionend 先发的特例）
                  if (imeGuard(e)) return;
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) add();
                  if (e.key === 'Escape') setShowNew(false);
                }}
              />
              <div className="mt-3 flex items-center gap-2.5">
                <span className="text-xs text-[var(--text-3)] shrink-0">标签</span>
                <input
                  className="flex-1 h-8 rounded-md border border-[var(--border)] px-2.5 text-xs focus:outline-none focus:border-[var(--brand)] text-[var(--text-1)]"
                  placeholder="可选，逗号分隔，如：方案,待确认"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  {...imeProps}
                  onKeyDown={(e) => {
                    if (imeGuard(e)) return;
                    if (e.key === 'Enter') add();
                  }}
                />
              </div>
            </div>

            {/* 底栏 */}
            <div className="px-5 py-3 border-t border-[var(--border-light)] flex items-center justify-between">
              <span className="text-[11px] text-[var(--text-4)]">Ctrl / ⌘ + Enter 快速保存</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowNew(false)}
                  className="h-7 px-3 text-xs rounded-md border border-[var(--border)] text-[var(--text-1)] hover:bg-[var(--bg-2)]"
                >
                  取消
                </button>
                <button
                  onClick={add}
                  disabled={!content.trim()}
                  className="h-7 px-3.5 text-xs rounded-md bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)] disabled:opacity-40"
                >
                  {editItem ? '保存修改' : '存入 Inbox'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2 max-w-3xl">
        {items.length === 0 ? (
          <p className="text-sm text-slate-400 pt-16 text-center">Inbox 空空如也，随便记点什么吧</p>
        ) : (
          items.map((it) => (
            <div key={it.id} className="rounded-xl bg-white border border-slate-200 p-4">
              <p
                className="text-sm text-slate-800 cursor-pointer hover:text-[var(--brand)] whitespace-pre-wrap"
                onClick={() => openEdit(it)}
                title="点击打开编辑"
              >
                {it.content}
              </p>
              <div className="mt-2 flex items-center gap-3 text-xs text-slate-400">
                <span>{it.created_at.slice(0, 16).replace('T', ' ')}</span>
                {it.tags && <span className="px-1.5 py-0.5 rounded bg-slate-100">{it.tags}</span>}
                <button
                  onClick={() => openEdit(it)}
                  className="text-slate-500 hover:underline"
                >
                  编辑
                </button>
                <button
                  onClick={() => { setConvertId(it.id); setConvertProjectId(''); }}
                  className="text-[var(--brand)] hover:underline"
                >
                  转为任务
                </button>
                <button
                  onClick={() => sediment(it)}
                  className="text-emerald-600 hover:underline"
                >
                  沉淀到知识库
                </button>
                <button onClick={() => remove(it.id)} className="text-red-400 hover:underline">
                  删除
                </button>
              </div>
              {convertId === it.id && (
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <select
                    value={convertType}
                    onChange={(e) => { setConvertType(e.target.value as TaskType); setConvertProjectId(''); }}
                    className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                  >
                    <option value="side">支线</option>
                    <option value="main">主线</option>
                    <option value="follow">跟进</option>
                    <option value="idea">想法</option>
                  </select>
                  {convertType !== 'idea' && (
                    <select
                      value={convertProjectId}
                      onChange={(e) => setConvertProjectId(e.target.value)}
                      className="rounded-lg border border-slate-300 px-2 py-1 text-sm max-w-48"
                      title="所属项目"
                    >
                      <option value="">新建同名项目</option>
                      {projects
                        .filter((p) => p.type === convertType && (p.status === 'todo' || p.status === 'doing'))
                        .map((p) => (
                          <option key={p.id} value={p.id}>📁 {p.name}</option>
                        ))}
                    </select>
                  )}
                  {convertType === 'follow' && !convertProjectId && (
                    <>
                      <input
                        className="rounded-lg border border-amber-300 px-2 py-1 text-sm"
                        placeholder="被催人"
                        value={convertPerson}
                        onChange={(e) => setConvertPerson(e.target.value)}
                      />
                      <input
                        type="date"
                        className="rounded-lg border border-amber-300 px-2 py-1 text-sm"
                        value={convertDate}
                        onChange={(e) => setConvertDate(e.target.value)}
                      />
                    </>
                  )}
                  <button
                    onClick={() => convert(it.id)}
                    className="rounded-lg bg-emerald-600 text-white px-3 py-1 text-sm hover:bg-emerald-700"
                  >
                    确认转换
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
