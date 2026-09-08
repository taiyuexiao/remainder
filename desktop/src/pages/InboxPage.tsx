import { useCallback, useEffect, useState } from 'react';
import { api, type InboxItem, type Project, type TaskType } from '../api/client';

export default function InboxPage() {
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

  const add = async () => {
    if (!content.trim()) return;
    await api.createInbox(content.trim(), tags.trim());
    setContent('');
    setTags('');
    setShowNew(false);
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
          onClick={() => setShowNew(true)}
          className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700 shadow-sm"
        >
          ＋ 新建速记
        </button>
      </header>

      {/* 新建速记弹窗 */}
      {showNew && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center"
          onClick={() => setShowNew(false)}
        >
          <div
            className="w-[480px] rounded-2xl bg-white shadow-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-slate-800 mb-3">💡 新建速记</h3>
            <textarea
              autoFocus
              rows={4}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
              placeholder="有什么想法？写下来…（Ctrl+Enter 存入）"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) add();
                if (e.key === 'Escape') setShowNew(false);
              }}
            />
            <input
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              placeholder="标签（可选，逗号分隔）"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowNew(false)}
                className="rounded-lg px-4 py-1.5 text-sm text-slate-500 hover:bg-slate-100"
              >
                取消
              </button>
              <button
                onClick={add}
                disabled={!content.trim()}
                className="rounded-lg bg-indigo-600 text-white px-4 py-1.5 text-sm hover:bg-indigo-700 disabled:opacity-40"
              >
                存入 Inbox
              </button>
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
              <p className="text-sm text-slate-800">{it.content}</p>
              <div className="mt-2 flex items-center gap-3 text-xs text-slate-400">
                <span>{it.created_at.slice(0, 16).replace('T', ' ')}</span>
                {it.tags && <span className="px-1.5 py-0.5 rounded bg-slate-100">{it.tags}</span>}
                <button
                  onClick={() => { setConvertId(it.id); setConvertProjectId(''); }}
                  className="text-indigo-600 hover:underline"
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
