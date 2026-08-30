import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, TYPE_LABEL, type Task, type TaskType } from '../api/client';

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
const CHIP_STYLE: Record<TaskType, string> = {
  main: 'bg-indigo-100 text-indigo-700',
  side: 'bg-emerald-100 text-emerald-700',
  follow: 'bg-amber-100 text-amber-700',
  idea: 'bg-purple-100 text-purple-700',
};

function pad(n: number) {
  return String(n).padStart(2, '0');
}
function dateStr(y: number, m: number, d: number) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

export default function CalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-based
  const [tasks, setTasks] = useState<Task[]>([]);
  const todayStr = dateStr(now.getFullYear(), now.getMonth(), now.getDate());

  const reload = useCallback(async () => {
    try {
      setTasks(await api.listTasks());
    } catch {
      /* 错误条由列表页负责，这里静默 */
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // ddl(YYYY-MM-DD) -> tasks
  const byDate = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.ddl) continue;
      const key = t.ddl.slice(0, 10);
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(t);
    }
    return m;
  }, [tasks]);

  // 月历格子：周一起始，6 行 x 7 列
  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const startOffset = (first.getDay() + 6) % 7; // 周一=0
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrev = new Date(year, month, 0).getDate();
    const list: { date: string; day: number; inMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = i - startOffset + 1;
      if (d < 1) {
        list.push({ date: dateStr(year, month - 1, daysInPrev + d), day: daysInPrev + d, inMonth: false });
      } else if (d > daysInMonth) {
        list.push({ date: dateStr(year, month + 1, d - daysInMonth), day: d - daysInMonth, inMonth: false });
      } else {
        list.push({ date: dateStr(year, month, d), day: d, inMonth: true });
      }
    }
    return list;
  }, [year, month]);

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 bg-white border-b border-slate-200 flex items-center gap-4">
        <h2 className="font-semibold">日历</h2>
        <div className="flex items-center gap-2 text-sm">
          <button onClick={() => shiftMonth(-1)} className="px-2 py-1 rounded hover:bg-slate-100">←</button>
          <span className="font-medium w-28 text-center">{year} 年 {month + 1} 月</span>
          <button onClick={() => shiftMonth(1)} className="px-2 py-1 rounded hover:bg-slate-100">→</button>
          <button
            onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); }}
            className="ml-2 px-2.5 py-1 rounded border border-slate-300 text-xs hover:bg-slate-50"
          >
            今天
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-hidden p-4 flex flex-col">
        <div className="grid grid-cols-7 text-center text-xs text-slate-400 pb-2">
          {WEEKDAYS.map((w) => <div key={w}>周{w}</div>)}
        </div>
        <div className="grid grid-cols-7 grid-rows-6 flex-1 gap-1">
          {cells.map((c) => {
            const dayTasks = byDate.get(c.date) ?? [];
            const isOverdue = c.date < todayStr && dayTasks.some((t) => t.status !== 'done');
            return (
              <div
                key={c.date}
                className={`rounded-lg border p-1.5 overflow-hidden flex flex-col ${
                  c.inMonth ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-100'
                } ${c.date === todayStr ? 'ring-2 ring-indigo-400' : ''}`}
              >
                <div className={`text-xs mb-1 flex items-center justify-between ${
                  c.inMonth ? 'text-slate-600' : 'text-slate-300'
                }`}>
                  <span className={c.date === todayStr ? 'font-bold text-indigo-600' : ''}>{c.day}</span>
                  {isOverdue && <span className="w-1.5 h-1.5 rounded-full bg-red-500" title="有逾期" />}
                </div>
                <div className="space-y-0.5 overflow-hidden">
                  {dayTasks.slice(0, 3).map((t) => (
                    <div
                      key={t.id}
                      title={`${t.project_name ? `${t.project_name} · ` : ''}${TYPE_LABEL[t.type]} · ${t.title}`}
                      className={`text-[10px] px-1 py-0.5 rounded truncate ${CHIP_STYLE[t.type]} ${
                        t.status === 'done' ? 'opacity-40 line-through' : ''
                      }`}
                    >
                      {t.title}
                    </div>
                  ))}
                  {dayTasks.length > 3 && (
                    <div className="text-[10px] text-slate-400 px-1">+{dayTasks.length - 3} 更多</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
