import { useCallback, useEffect, useState } from 'react';
import { api, TYPE_LABEL, type TodayEntry, type TodayView } from '../api/client';

function Section({
  title,
  color,
  tasks,
  onToggle,
}: {
  title: string;
  color: string;
  tasks: TodayEntry[];
  onToggle: (t: TodayEntry) => void;
}) {
  if (!tasks.length) return null;
  return (
    <div>
      <h3 className={`text-sm font-semibold mb-2 ${color}`}>{title} · {tasks.length}</h3>
      <div className="space-y-1.5">
        {tasks.map((t) => (
          <div key={t.id} className="flex items-center gap-3 rounded-lg bg-white border border-slate-200 px-3 py-2">
            <input
              type="checkbox"
              checked={t.status === 'done'}
              onChange={() => onToggle(t)}
              className="accent-indigo-600"
            />
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
              {TYPE_LABEL[t.type]}
            </span>
            {t.project_name && (
              <span className="text-xs text-slate-400 shrink-0">{t.project_name} ·</span>
            )}
            <span className={`flex-1 text-sm ${t.status === 'done' ? 'line-through text-slate-400' : ''}`}>
              {t.title}
            </span>
            {t.person && <span className="text-xs text-amber-600">@{t.person}</span>}
            {t.ddl && <span className="text-xs text-slate-400">{t.ddl.slice(0, 10)}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TodayPage() {
  const [data, setData] = useState<TodayView | null>(null);

  const reload = useCallback(async () => {
    setData(await api.today());
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const toggleTask = async (t: TodayEntry) => {
    if (t.status === 'done') await api.updateTask(t.id, { status: 'todo' });
    else await api.doneTask(t.id);
    reload();
  };

  // followUps 段是 follow 型项目，完成/撤销走项目接口
  const toggleProject = async (t: TodayEntry) => {
    if (t.status === 'done') await api.projects.update(t.id, { status: 'todo' });
    else await api.projects.done(t.id);
    reload();
  };

  if (!data) return <div className="p-6 text-sm text-slate-400">加载中…</div>;

  const doneToday = data.today.filter((t) => t.status === 'done');
  const todoToday = data.today.filter((t) => t.status !== 'done');

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 bg-white border-b border-slate-200">
        <h2 className="font-semibold">今日</h2>
        <p className="text-xs text-slate-400 mt-0.5">{data.date}</p>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6 max-w-3xl">
        <Section title="🔴 已逾期" color="text-red-600" tasks={data.overdue} onToggle={toggleTask} />
        <Section title="🟢 今日到期" color="text-emerald-600" tasks={todoToday} onToggle={toggleTask} />
        <Section title="🟡 今日待跟进" color="text-amber-600" tasks={data.followUps} onToggle={toggleProject} />
        <Section title="✅ 今日已完成" color="text-slate-500" tasks={doneToday} onToggle={toggleTask} />
        {!data.overdue.length && !todoToday.length && !data.followUps.length && !doneToday.length && (
          <p className="text-sm text-slate-400 pt-16 text-center">今天没有任务，去全部任务页创建吧</p>
        )}
      </div>
    </div>
  );
}
