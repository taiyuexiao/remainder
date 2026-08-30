import { useCallback, useEffect, useState } from 'react';
import { api, STATUS_LABEL, type Project, type TaskStatus } from '../api/client';

export default function FollowUpsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      // 跟进页列 follow 型项目（M10：跟进数据挂项目级）
      const all = await api.projects.list({ type: 'follow' });
      // 按下次跟进日期升序，无日期的排最后
      all.sort((a, b) => {
        const da = a.next_follow_date ?? '9999-12-31';
        const db = b.next_follow_date ?? '9999-12-31';
        return da.localeCompare(db);
      });
      setProjects(all);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const today = new Date().toISOString().slice(0, 10);

  const handleUrge = async (id: string) => {
    await api.urge(id);
    reload();
  };

  const handleToggle = async (p: Project) => {
    if (p.status === 'done') await api.projects.update(p.id, { status: 'todo' });
    else await api.projects.done(p.id);
    reload();
  };

  // 改下次跟进日：走 follow_ups 路由（后端会与现有行合并，person 不会丢）
  const updateDate = async (id: string, date: string) => {
    await api.updateFollowUp(id, { nextFollowDate: date });
    reload();
  };

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 bg-white border-b border-slate-200 flex items-center justify-between">
        <div>
          <h2 className="font-semibold">跟进</h2>
          <p className="text-xs text-slate-400 mt-0.5">Waiting For · 等别人推进的项目</p>
        </div>
        <span className="text-xs text-slate-400">{projects.length} 个跟进项目</span>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <p className="text-sm text-slate-400">加载中…</p>
        ) : projects.length === 0 ? (
          <p className="text-sm text-slate-400 pt-20 text-center">暂无跟进项目，去全部任务页创建一个“跟进”项目吧</p>
        ) : (
          <div className="space-y-3 max-w-3xl">
            {projects.map((p) => {
              const overdue = p.status !== 'done' && (p.next_follow_date ?? '9999-12-31') < today;
              return (
                <div
                  key={p.id}
                  className={`rounded-xl bg-white border p-4 flex items-start gap-4 ${
                    overdue ? 'border-red-300 shadow-sm' : 'border-slate-200'
                  }`}
                >
                  <div className="mt-0.5">
                    <input
                      type="checkbox"
                      title="完成整个项目"
                      checked={p.status === 'done'}
                      onChange={() => handleToggle(p)}
                      className="accent-emerald-600 w-4 h-4"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">📁 跟进项目</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                        {STATUS_LABEL[p.status as TaskStatus]}
                      </span>
                      <span className={`text-xs font-medium ${overdue ? 'text-red-600' : 'text-slate-500'}`}>
                        {overdue ? '已逾期' : '下次跟进'}：
                      </span>
                      <input
                        type="date"
                        value={p.next_follow_date ?? ''}
                        onChange={(e) => updateDate(p.id, e.target.value)}
                        className="text-sm border border-slate-300 rounded px-1.5 py-0.5"
                      />
                    </div>
                    <h3 className={`mt-1.5 text-sm font-medium ${p.status === 'done' ? 'line-through text-slate-400' : ''}`}>
                      {p.name}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      被催人：<span className="font-medium text-slate-700">{p.person ?? '—'}</span>
                      <span className="ml-3">子任务 {p.done_count}/{p.total_count}</span>
                      {p.urge_count ? (
                        <span className="ml-3 px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                          已催 {p.urge_count} 次
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <button
                    onClick={() => handleUrge(p.id)}
                    disabled={p.status === 'done'}
                    className="shrink-0 rounded-lg bg-amber-500 text-white px-3 py-1.5 text-sm hover:bg-amber-600 disabled:opacity-40"
                  >
                    一键再催
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
