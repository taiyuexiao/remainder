import { useCallback, useEffect, useState } from 'react';
import { api, type Report, type TaskRangeData } from '../api/client';

const RANGE_LABEL: Record<string, string> = {
  today: '本日',
  week: '本周',
  month: '本月',
};

export default function ReportsPage() {
  const [range, setRange] = useState<'today' | 'week' | 'month'>('today');
  const [tasks, setTasks] = useState<TaskRangeData | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);

  const loadTasks = useCallback(async () => {
    try {
      const data = await api.reportTasks(range);
      setTasks(data);
    } catch (e) {
      alert((e as Error).message);
    }
  }, [range]);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      setReports(await api.listReports());
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
    loadReports();
  }, [loadTasks, loadReports]);

  const generate = async (type: 'daily' | 'weekly' | 'monthly') => {
    setGenerating(type);
    try {
      const fn = {
        daily: api.generateDailyReport,
        weekly: api.generateWeeklyReport,
        monthly: api.generateMonthlyReport,
      }[type];
      await fn();
      await loadReports();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setGenerating(null);
    }
  };

  const removeReport = async (id: string) => {
    if (!confirm('确认删除该报告？')) return;
    try {
      await api.deleteReport(id);
      if (selectedReport?.id === id) setSelectedReport(null);
      await loadReports();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const viewReport = async (id: string) => {
    try {
      setSelectedReport(await api.getReport(id));
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <header className="px-6 py-4 bg-white border-b border-slate-200">
        <h2 className="font-semibold">报告</h2>
        <p className="text-xs text-slate-400 mt-0.5">日报 / 周报 / 月报 + 任务概览 + 历史记录</p>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {/* 任务概览卡片 */}
        <div className="grid grid-cols-3 gap-3">
          {(['today', 'week', 'month'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-xl p-4 text-left transition-colors ${
                range === r
                  ? 'bg-indigo-600 text-white shadow'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <div className="text-xs opacity-80">{RANGE_LABEL[r]}任务</div>
              <div className="text-lg font-semibold mt-1">
                {range === r && tasks ? (
                  <>
                    {range === 'today'
                      ? (tasks.today?.filter((t) => t.status !== 'done').length ?? 0) +
                        (tasks.overdue?.length ?? 0)
                      : range === 'week'
                        ? (tasks.doingProjects?.length ?? 0) + (tasks.overdueTasks?.length ?? 0)
                        : (tasks.doingProjects?.length ?? 0) + (tasks.overdueTasks?.length ?? 0)}
                  </>
                ) : (
                  '-'
                )}
              </div>
              <div className="text-[10px] opacity-70 mt-1">
                {range === 'today' ? '今日待办 + 逾期' : '进行中 + 逾期'}
              </div>
            </button>
          ))}
        </div>

        {/* 任务明细 */}
        {tasks && (
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-sm">{RANGE_LABEL[range]}任务明细</h3>
              <span className="text-xs text-slate-400">{tasks.date}</span>
            </div>
            <div className="grid grid-cols-3 gap-4 text-xs">
              <div>
                <p className="text-slate-400 mb-2">逾期</p>
                {tasks.overdue?.length || tasks.overdueTasks?.length ? (
                  <ul className="space-y-1">
                    {(tasks.overdue ?? tasks.overdueTasks ?? []).map((t) => (
                      <li key={t.id} className="text-red-600">
                        {t.title}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-slate-300">无</p>
                )}
              </div>
              <div>
                <p className="text-slate-400 mb-2">进行中</p>
                {range === 'today' ? (
                  tasks.today?.filter((t) => t.status !== 'done').length ? (
                    <ul className="space-y-1">
                      {tasks.today
                        ?.filter((t) => t.status !== 'done')
                        .map((t) => (
                          <li key={t.id} className="text-slate-700">
                            {t.title}
                          </li>
                        ))}
                    </ul>
                  ) : (
                    <p className="text-slate-300">无</p>
                  )
                ) : (
                  tasks.doingProjects?.length ? (
                    <ul className="space-y-1">
                      {tasks.doingProjects.map((p) => (
                        <li key={p.id} className="text-slate-700">
                          {p.name}（{p.done_count}/{p.total_count}）
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-slate-300">无</p>
                  )
                )}
              </div>
              <div>
                <p className="text-slate-400 mb-2">已完成</p>
                {range === 'today' ? (
                  tasks.today?.filter((t) => t.status === 'done').length ? (
                    <ul className="space-y-1">
                      {tasks.today
                        ?.filter((t) => t.status === 'done')
                        .map((t) => (
                          <li key={t.id} className="text-emerald-600">
                            {t.title}
                          </li>
                        ))}
                    </ul>
                  ) : (
                    <p className="text-slate-300">无</p>
                  )
                ) : (
                  <>
                    {tasks.doneProjects?.length ? (
                      <ul className="space-y-1">
                        {tasks.doneProjects.map((p) => (
                          <li key={p.id} className="text-emerald-600">
                            {p.name}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {tasks.doneTasks?.length ? (
                      <ul className="space-y-1 mt-1">
                        {tasks.doneTasks.map((t) => (
                          <li key={t.id} className="text-emerald-600">
                            {t.title}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {!tasks.doneProjects?.length && !tasks.doneTasks?.length && (
                      <p className="text-slate-300">无</p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 生成按钮 */}
        <div className="flex gap-2">
          <button
            onClick={() => generate('daily')}
            disabled={generating !== null}
            className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm hover:bg-emerald-700 disabled:opacity-40"
          >
            {generating === 'daily' ? '生成中…' : '生成本日报告'}
          </button>
          <button
            onClick={() => generate('weekly')}
            disabled={generating !== null}
            className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm hover:bg-indigo-700 disabled:opacity-40"
          >
            {generating === 'weekly' ? '生成中…' : '生成本周报告'}
          </button>
          <button
            onClick={() => generate('monthly')}
            disabled={generating !== null}
            className="rounded-lg bg-amber-600 text-white px-4 py-2 text-sm hover:bg-amber-700 disabled:opacity-40"
          >
            {generating === 'monthly' ? '生成中…' : '生成本月报告'}
          </button>
        </div>

        {/* 历史记录 */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="font-medium text-sm mb-3">历史报告</h3>
          {loading ? (
            <p className="text-xs text-slate-400">加载中…</p>
          ) : reports.length === 0 ? (
            <p className="text-xs text-slate-400">暂无历史报告，点击上方按钮生成</p>
          ) : (
            <div className="space-y-2">
              {reports.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm">
                      {r.type === 'daily' ? '📅' : r.type === 'weekly' ? '📊' : '📈'}
                    </span>
                    <span className="text-sm text-slate-700 truncate">{r.title}</span>
                    <span className="text-xs text-slate-400">{r.date}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => viewReport(r.id)}
                      className="text-xs text-indigo-600 hover:underline"
                    >
                      查看
                    </button>
                    <button
                      onClick={() => removeReport(r.id)}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 报告详情弹窗 */}
      {selectedReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-[640px] max-h-[80vh] bg-white rounded-2xl shadow-xl flex flex-col">
            <header className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-semibold text-sm">{selectedReport.title}</h3>
              <button onClick={() => setSelectedReport(null)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </header>
            <div className="flex-1 overflow-y-auto p-5">
              <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
                {selectedReport.content}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
