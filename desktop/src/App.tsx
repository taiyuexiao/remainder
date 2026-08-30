import { useEffect, useState } from 'react';
import { api, type NotificationItem } from './api/client';
import TasksPage from './pages/TasksPage';
import CalendarPage from './pages/CalendarPage';
import FollowUpsPage from './pages/FollowUpsPage';
import TodayPage from './pages/TodayPage';
import InboxPage from './pages/InboxPage';
import ClipsPage from './pages/ClipsPage';
import SettingsPage from './pages/SettingsPage';
import DocsPage from './pages/DocsPage';

type NavKey = 'today' | 'calendar' | 'tasks' | 'follow' | 'inbox' | 'clips' | 'docs' | 'settings';

const NAV: { key: NavKey; label: string; icon: string; hint: string }[] = [
  { key: 'today', label: '今日', icon: '☀️', hint: '' },
  { key: 'calendar', label: '日历', icon: '📅', hint: '' },
  { key: 'tasks', label: '全部任务', icon: '📋', hint: '' },
  { key: 'follow', label: '跟进', icon: '🤝', hint: '' },
  { key: 'inbox', label: 'Inbox', icon: '💡', hint: '' },
  { key: 'clips', label: '剪藏', icon: '📥', hint: '' },
  { key: 'docs', label: '文档', icon: '📝', hint: '' },
  { key: 'settings', label: '设置', icon: '⚙️', hint: '' },
];

export default function App() {
  const [nav, setNav] = useState<NavKey>('tasks');
  const [toasts, setToasts] = useState<NotificationItem[]>([]);

  // 浏览器环境下轮询提醒队列做 Toast；Tauri 环境由常驻桌面组件负责（WidgetPage 轮询+原生通知）
  const isTauriEnv = '__TAURI_INTERNALS__' in window;
  useEffect(() => {
    if (isTauriEnv) return;
    let timer: number;
    const poll = async () => {
      try {
        const list = await api.listNotifications();
        if (list.length) {
          setToasts((prev) => {
            const seen = new Set(prev.map((t) => t.id));
            const fresh = list.filter((t) => !seen.has(t.id));
            return [...prev, ...fresh];
          });
          await api.clearNotifications();
        }
      } catch {
        /* 后端未启动时静默 */
      }
      timer = window.setTimeout(poll, 30_000);
    };
    poll();
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!toasts.length) return;
    const timer = window.setTimeout(() => {
      setToasts((prev) => prev.slice(1));
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [toasts]);

  const current = NAV.find((n) => n.key === nav)!;

  return (
    <div className="h-screen w-screen flex bg-slate-100 text-slate-800 overflow-hidden">
      {/* 左侧导航 */}
      <aside className="w-52 shrink-0 bg-white border-r border-slate-200 flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100">
          <h1 className="text-lg font-bold tracking-tight">Remainder</h1>
          <p className="text-xs text-slate-400 mt-0.5">任务规划与提醒助手</p>
        </div>
        <nav className="flex-1 py-2">
          {NAV.map((n) => (
            <button
              key={n.key}
              onClick={() => setNav(n.key)}
              className={`w-full text-left px-5 py-2.5 text-sm flex items-center gap-2.5 transition-colors ${
                nav === n.key
                  ? 'bg-indigo-50 text-indigo-700 font-medium border-r-2 border-indigo-500'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span>{n.icon}</span>
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="px-5 py-3 text-[10px] text-slate-300">v0.1.0 · 本地数据</div>
      </aside>

      {/* 内容区 */}
      <main className="flex-1 min-w-0">
        {nav === 'today' ? (
          <TodayPage />
        ) : nav === 'calendar' ? (
          <CalendarPage />
        ) : nav === 'tasks' ? (
          <TasksPage />
        ) : nav === 'follow' ? (
          <FollowUpsPage />
        ) : nav === 'inbox' ? (
          <InboxPage />
        ) : nav === 'clips' ? (
          <ClipsPage />
        ) : nav === 'docs' ? (
          <DocsPage />
        ) : nav === 'settings' ? (
          <SettingsPage />
        ) : (
          <TodayPage />
        )}
      </main>

      {/* Toast 提醒 */}
      <div className="fixed top-4 right-4 z-50 space-y-2 w-80">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="rounded-xl bg-white shadow-lg border border-amber-200 px-4 py-3 flex items-start gap-3 animate-[slideIn_0.2s_ease-out]"
          >
            <span className="text-amber-500 text-lg">⏰</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">任务到期</p>
              <p className="text-xs text-slate-500 truncate mt-0.5">{t.title}</p>
            </div>
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="text-slate-300 hover:text-slate-500"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
