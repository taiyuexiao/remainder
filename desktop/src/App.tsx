import { useEffect, useState } from 'react';
import { api, type NotificationItem } from './api/client';
import { BackgroundLayer } from './components/BackgroundLayer';
import TasksPage from './pages/TasksPage';
import CalendarPage from './pages/CalendarPage';
import FollowUpsPage from './pages/FollowUpsPage';
import TodayPage from './pages/TodayPage';
import InboxPage from './pages/InboxPage';
import ClipsPage from './pages/ClipsPage';
import SettingsPage from './pages/SettingsPage';
import DocsPage from './pages/DocsPage';
import ReportsPage from './pages/ReportsPage';
import CanvasPage from './pages/CanvasPage';
import TimelinePage from './pages/TimelinePage';
import ChatPage from './pages/ChatPage';
import TeamsPage from './pages/TeamsPage';

type NavKey = 'today' | 'assistant' | 'calendar' | 'timeline' | 'tasks' | 'follow' | 'inbox' | 'clips' | 'docs' | 'reports' | 'canvas' | 'knowledge' | 'settings';

const NAV: { key: NavKey; label: string; icon: string; hint: string }[] = [
  { key: 'today', label: '今日', icon: '☀️', hint: '' },
  { key: 'assistant', label: 'AI 助手', icon: '🤖', hint: '' },
  { key: 'calendar', label: '日历', icon: '📅', hint: '' },
  { key: 'timeline', label: '全景', icon: '🗺️', hint: '' },
  { key: 'tasks', label: '全部任务', icon: '📋', hint: '' },
  { key: 'follow', label: '跟进', icon: '🤝', hint: '' },
  { key: 'inbox', label: 'Inbox', icon: '💡', hint: '' },
  { key: 'clips', label: '剪藏', icon: '📥', hint: '' },
  { key: 'docs', label: '文档', icon: '📝', hint: '' },
  { key: 'knowledge', label: '团队', icon: '👥', hint: '' },
  { key: 'reports', label: '报告', icon: '📊', hint: '' },
  { key: 'canvas', label: '画布', icon: '🎨', hint: '' },
  { key: 'settings', label: '设置', icon: '⚙️', hint: '' },
];

export default function App() {
  const [nav, setNav] = useState<NavKey>('tasks');
  const [toasts, setToasts] = useState<NotificationItem[]>([]);
  // 后端就绪门：0=检查中 1=就绪 2=超时（避免后端启动慢时各页直接报"后端连接失败"）
  const [backendState, setBackendState] = useState<0 | 1 | 2>(0);
  // 一键双端同步（M21）：idle=空闲 syncing=请求中 restarting=后端重启应用远端数据
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'restarting'>('idle');
  const [syncMsg, setSyncMsg] = useState('');

  const doSync = async () => {
    if (syncState !== 'idle') return;
    setSyncState('syncing');
    setSyncMsg('');
    try {
      const r = await api.sync();
      if (r.status === 'restarting') {
        // 后端正在退出并换用远端数据：轮询健康检查，恢复后整体刷新
        setSyncState('restarting');
        for (let i = 0; i < 40; i++) {
          await new Promise((res) => window.setTimeout(res, 1000));
          try {
            await api.health();
            location.reload();
            return;
          } catch {
            /* 后端尚未恢复 */
          }
        }
        setSyncMsg('后端重启超时，请重开应用');
        setSyncState('idle');
        return;
      }
      const backupTip = r.backup ? `（本地改动已备份到 ${r.backup} 分支）` : '';
      setSyncMsg(
        r.status === 'pushed' ? `已推送到远端，另一台设备点同步即可接收` : `已是最新${backupTip}`,
      );
    } catch (e) {
      setSyncMsg(`同步失败：${(e as Error).message}`);
    } finally {
      setSyncState((s) => (s === 'syncing' ? 'idle' : s));
      window.setTimeout(() => setSyncMsg(''), 10_000);
    }
  };

  // agent client_actions（M34 / A3）：跨页面切换栏目
  useEffect(() => {
    const onNav = (e: Event) => {
      const page = (e as CustomEvent<{ page: string }>).detail.page;
      if (NAV.some((n) => n.key === page)) setNav(page as NavKey);
    };
    window.addEventListener('app-nav', onNav);
    return () => window.removeEventListener('app-nav', onNav);
  }, []);

  useEffect(() => {
    if (backendState === 1) return;
    let timer: number;
    let attempts = 0;
    const poll = async () => {
      try {
        await api.health();
        setBackendState(1);
        return;
      } catch {
        attempts += 1;
        if (attempts >= 30) { setBackendState(2); return; }
        timer = window.setTimeout(poll, 1000);
      }
    };
    poll();
    return () => window.clearTimeout(timer);
  }, [backendState]);

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

  // 后端未就绪：显示启动画面（页面在后端起来后再挂载，天然避免连接失败报错）
  if (backendState !== 1) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-100 text-slate-500 gap-3">
        {backendState === 0 ? (
          <>
            <div className="w-8 h-8 rounded-full border-2 border-indigo-200 border-t-indigo-500 animate-spin" />
            <p className="text-sm">正在连接后端服务…</p>
            <p className="text-xs text-slate-400">首次启动可能需要几秒钟</p>
          </>
        ) : (
          <>
            <p className="text-sm text-red-500">后端服务连接失败</p>
            <p className="text-xs text-slate-400">请确认 Remainder Server 已启动（可双击桌面图标重试）</p>
            <button
              onClick={() => setBackendState(0)}
              className="mt-2 rounded-lg bg-indigo-500 text-white text-sm px-4 py-1.5 hover:bg-indigo-600"
            >
              重试
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="app-root h-screen w-screen flex bg-slate-100 text-slate-800 overflow-hidden relative">
      <BackgroundLayer />
      {/* 左侧导航 */}
      <aside className="w-52 shrink-0 bg-white border-r border-slate-200 flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold tracking-tight">Remainder</h1>
            <button
              onClick={doSync}
              disabled={syncState !== 'idle'}
              title="双端同步：提交本地改动并拉取另一端数据"
              className="w-7 h-7 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:cursor-default flex items-center justify-center transition-colors"
            >
              <span className={`text-sm leading-none ${syncState !== 'idle' ? 'inline-block animate-spin' : ''}`}>
                ⟳
              </span>
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">任务规划与提醒助手</p>
          {syncMsg && <p className="text-[11px] text-indigo-500 mt-1.5 leading-snug">{syncMsg}</p>}
          {syncState === 'restarting' && (
            <p className="text-[11px] text-indigo-500 mt-1.5 leading-snug">正在应用远端数据，服务重启中…</p>
          )}
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
        <div className="px-5 py-3 text-[10px] text-slate-300">v0.2.4 · 本地数据</div>
      </aside>

      {/* 内容区 */}
      <main className="flex-1 min-w-0">
        {nav === 'today' ? (
          <TodayPage />
        ) : nav === 'assistant' ? (
          <ChatPage />
        ) : nav === 'calendar' ? (
          <CalendarPage />
        ) : nav === 'timeline' ? (
          <TimelinePage />
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
        ) : nav === 'reports' ? (
          <ReportsPage />
        ) : nav === 'canvas' ? (
          <CanvasPage />
        ) : nav === 'knowledge' ? (
          <TeamsPage />
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
