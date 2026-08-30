import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, API_BASE, type Clip } from '../api/client';

/** 来源域名小字（url 取 hostname，取不到显示来源类型） */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** content_html 中的本地图片相对路径拼上 API base（服务端已 sanitize，可直接渲染） */
function withImageBase(html: string): string {
  return html.replaceAll('src="/api/clips/images/', `src="${API_BASE}/api/clips/images/`);
}

export default function ClipsPage() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Clip | null>(null);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    try {
      const list = await api.listClips();
      setClips(list);
      setError('');
    } catch (e) {
      setError(`后端连接失败：${(e as Error).message}`);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // 选中条目 → 拉详情（列表行无 content_html）
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    api.getClip(selectedId)
      .then((c) => !cancelled && setDetail(c))
      .catch(() => !cancelled && setDetail(null));
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const selected = useMemo(
    () => clips.find((c) => c.id === selectedId) ?? null,
    [clips, selectedId],
  );

  const convert = async (id: string) => {
    try {
      await api.convertClip(id);
      await reload();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('确认删除这条剪藏？')) return;
    await api.deleteClip(id);
    if (selectedId === id) setSelectedId(null);
    reload();
  };

  return (
    <div className="h-full flex">
      {/* 左侧：剪藏列表 */}
      <section className="flex-1 min-w-0 flex flex-col border-r border-slate-200">
        <header className="px-6 py-4 bg-white border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold">剪藏</h2>
          <span className="text-xs text-slate-400">{clips.length} 条</span>
        </header>

        {error && <div className="px-6 py-2 text-sm text-red-500 bg-red-50">{error}</div>}

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2.5">
          {clips.length === 0 && !error ? (
            <div className="pt-20 text-center space-y-2">
              <p className="text-sm text-slate-400">剪藏箱空空如也</p>
              <p className="text-xs text-slate-300">
                在浏览器里选中内容 → 右键「同步到 Remainder」，或复制后用热键唤起速记窗做剪贴板剪藏
              </p>
            </div>
          ) : (
            clips.map((c) => (
              <div
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`rounded-xl bg-white border p-3.5 cursor-pointer transition-colors ${
                  selectedId === c.id
                    ? 'border-indigo-300 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                    c.source === 'clipboard'
                      ? 'bg-purple-100 text-purple-700'
                      : 'bg-sky-100 text-sky-700'
                  }`}>
                    {c.source === 'clipboard' ? '剪贴板' : '扩展'}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                    c.status === 'converted'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-500'
                  }`}>
                    {c.status === 'converted' ? '已转文档' : '待整理'}
                  </span>
                  {hostOf(c.url) && (
                    <span className="text-[10px] text-slate-400 truncate">{hostOf(c.url)}</span>
                  )}
                  <span className="flex-1" />
                  <span className="text-[10px] text-slate-300 shrink-0">
                    {c.created_at.slice(0, 16).replace('T', ' ')}
                  </span>
                </div>
                <h3 className="mt-1.5 text-sm font-medium truncate">{c.title}</h3>
                {c.excerpt && (
                  <p className="mt-1 text-xs text-slate-500 line-clamp-2">{c.excerpt}</p>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      {/* 右侧：预览 + 操作 */}
      <aside className="w-[420px] shrink-0 bg-white flex flex-col">
        {selected ? (
          <>
            <div className="px-5 py-4 border-b border-slate-100 space-y-2.5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-semibold leading-snug">{selected.title}</h3>
                <button
                  onClick={() => setSelectedId(null)}
                  className="text-slate-300 hover:text-slate-500 shrink-0"
                >
                  ✕
                </button>
              </div>
              {selected.url && (
                <a
                  href={selected.url}
                  target="_blank"
                  rel="noopener"
                  className="block text-xs text-indigo-500 hover:underline truncate"
                >
                  {selected.url}
                </a>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => convert(selected.id)}
                  disabled={selected.status === 'converted'}
                  className="flex-1 rounded-lg bg-indigo-600 text-white py-1.5 text-sm hover:bg-indigo-700 disabled:opacity-40"
                >
                  {selected.status === 'converted' ? '已转文档' : '转为文档'}
                </button>
                <button
                  onClick={() => remove(selected.id)}
                  className="rounded-lg bg-red-50 text-red-600 px-3 py-1.5 text-sm hover:bg-red-100"
                >
                  删除
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {detail?.content_html ? (
                <div
                  className="clip-preview text-sm leading-relaxed text-slate-700"
                  dangerouslySetInnerHTML={{ __html: withImageBase(detail.content_html) }}
                />
              ) : (
                <p className="text-sm text-slate-300 text-center pt-16">加载中…</p>
              )}
            </div>
          </>
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-slate-300">
            选择一条剪藏查看预览
          </div>
        )}
      </aside>
    </div>
  );
}
