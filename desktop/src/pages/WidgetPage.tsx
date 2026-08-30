import { useCallback, useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { emit } from '@tauri-apps/api/event';
import { api, type TodayView, type TodayEntry } from '../api/client';
import { notifyNative } from '../notify';

const OPACITY_STEPS = [0.6, 0.75, 0.9, 1];

export default function WidgetPage() {
  const [data, setData] = useState<TodayView | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [opacityIdx, setOpacityIdx] = useState(() =>
    Number(localStorage.getItem('widget-opacity') ?? 2),
  );

  const reload = useCallback(async () => {
    try {
      setData(await api.today());
    } catch {
      /* 后端未启动时保持旧数据 */
    }
  }, []);

  useEffect(() => {
    reload();
    const t = window.setInterval(reload, 60_000);
    return () => window.clearInterval(t);
  }, [reload]);

  // 小组件常驻 → 由它轮询提醒队列并发 Windows 原生通知（主窗口开关都不影响）
  useEffect(() => {
    const poll = async () => {
      try {
        const list = await api.listNotifications();
        if (list.length) {
          for (const n of list) {
            void notifyNative('⏰ Remainder 任务到期', n.title);
            void emit('pet-reminder', n.title); // 转发桌宠：跳跃+气泡
          }
          await api.clearNotifications();
        }
      } catch { /* 后端未启动时静默 */ }
    };
    poll();
    const t = window.setInterval(poll, 30_000);
    return () => window.clearInterval(t);
  }, []);

  const alpha = OPACITY_STEPS[opacityIdx] ?? 0.9;

  const done = async (t: TodayEntry) => {
    await api.doneTask(t.id);
    reload();
  };

  // followUps 段是 follow 型项目，完成走项目接口
  const doneProject = async (t: TodayEntry) => {
    await api.projects.done(t.id);
    reload();
  };

  const openMain = async () => {
    const { getAllWindows } = await import('@tauri-apps/api/window');
    const main = (await getAllWindows()).find((w) => w.label === 'main');
    if (main) {
      await main.show();
      await main.setFocus();
    }
  };

  const toggleOnTop = async () => {
    const win = getCurrentWindow();
    await win.setAlwaysOnTop(!(await win.isAlwaysOnTop()));
    setMenu(null);
  };

  const cycleOpacity = () => {
    const next = (opacityIdx + 1) % OPACITY_STEPS.length;
    setOpacityIdx(next);
    localStorage.setItem('widget-opacity', String(next));
    setMenu(null);
  };

  const hideWidget = async () => {
    await getCurrentWindow().hide();
    setMenu(null);
  };

  const Section = ({
    title,
    color,
    tasks,
    onDone,
  }: {
    title: string;
    color: string;
    tasks: TodayEntry[];
    onDone: (t: TodayEntry) => void;
  }) =>
    tasks.length ? (
      <div className="px-3 pb-2">
        <div className={`text-[10px] font-semibold mb-1 ${color}`}>{title}</div>
        <div className="space-y-1">
          {tasks.map((t) => (
            <div
              key={t.id}
              onClick={() => onDone(t)}
              title="点击标记完成"
              className="flex items-center gap-2 rounded-md bg-white/10 hover:bg-white/20 px-2 py-1 cursor-pointer transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60 shrink-0" />
              {t.project_name && (
                <span className="text-[10px] text-white/40 shrink-0">{t.project_name} ·</span>
              )}
              <span className="text-xs text-white/90 truncate flex-1">{t.title}</span>
              {t.person && <span className="text-[10px] text-amber-300 shrink-0">@{t.person}</span>}
            </div>
          ))}
        </div>
      </div>
    ) : null;

  return (
    <div
      className="h-screen w-screen p-1 select-none"
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
      onClick={() => menu && setMenu(null)}
    >
      <div
        className="h-full rounded-2xl backdrop-blur-md overflow-hidden flex flex-col border border-white/10"
        style={{ backgroundColor: `rgba(15, 23, 42, ${alpha})` }}
        onDoubleClick={openMain}
      >
        {/* 标题栏（拖拽区） */}
        <div
          data-tauri-drag-region
          className="px-3 py-2 flex items-center justify-between cursor-move shrink-0"
        >
          <span data-tauri-drag-region className="text-xs font-semibold text-white/80">
            Remainder · 今日
          </span>
          <span className="text-[10px] text-white/40">{data?.date.slice(5) ?? ''}</span>
        </div>

        <div className="flex-1 overflow-y-auto pb-2">
          {!data ? (
            <p className="text-xs text-white/40 text-center pt-8">加载中…</p>
          ) : (
            <>
              <Section title="🔴 已逾期" color="text-red-400" tasks={data.overdue} onDone={done} />
              <Section title="🟢 今日到期" color="text-emerald-400" tasks={data.today.filter((t) => t.status !== 'done')} onDone={done} />
              <Section title="🟡 今日待跟进" color="text-amber-400" tasks={data.followUps} onDone={doneProject} />
              {!data.overdue.length &&
                !data.today.filter((t) => t.status !== 'done').length &&
                !data.followUps.length && (
                  <p className="text-xs text-white/40 text-center pt-8">今日无待办 🎉</p>
                )}
            </>
          )}
        </div>

        <div className="px-3 py-1.5 text-[9px] text-white/30 shrink-0">
          单击完成 · 双击展开 · 右键设置
        </div>
      </div>

      {/* 右键菜单 */}
      {menu && (
        <div
          className="fixed z-50 rounded-lg bg-slate-800 border border-white/10 shadow-xl py-1 text-xs text-white/90 w-32"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={cycleOpacity} className="w-full text-left px-3 py-1.5 hover:bg-white/10">
            透明度 {Math.round(alpha * 100)}%
          </button>
          <button
            onClick={() => {
              openMain();
              setMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-white/10"
          >
            打开主窗口
          </button>
          <button onClick={hideWidget} className="w-full text-left px-3 py-1.5 hover:bg-white/10 text-red-300">
            隐藏组件
          </button>
        </div>
      )}
    </div>
  );
}
