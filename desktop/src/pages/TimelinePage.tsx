import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type Project } from '../api/client';

/* ================= 常量与工具 ================= */

type Zoom = 'week' | 'month' | 'quarter';
type Density = 'page' | 'fullscreen';

const ZOOM_DAYS: Record<Zoom, [number, number]> = {
  week: [-7, 21],
  month: [-14, 45],
  quarter: [-30, 120],
};
const PX_PAGE: Record<Zoom, number> = { week: 48, month: 20, quarter: 8 };
const PX_FULL: Record<Zoom, number> = { week: 68, month: 28, quarter: 11 };

/** 类型视觉系统：主色 + 渐变终点 + 浅底 + 文字色 */
const TYPE_STYLE: Record<string, { c1: string; c2: string; soft: string; text: string; label: string }> = {
  main: { c1: '#6366f1', c2: '#818cf8', soft: '#eef2ff', text: '#4f46e5', label: '主线' },
  side: { c1: '#0ea5e9', c2: '#38bdf8', soft: '#f0f9ff', text: '#0284c7', label: '支线' },
  follow: { c1: '#f59e0b', c2: '#fbbf24', soft: '#fffbeb', text: '#d97706', label: '跟进' },
};
const DONE_STYLE = { c1: '#10b981', c2: '#34d399', soft: '#ecfdf5', text: '#059669' };
const OVERDUE_STYLE = { c1: '#f43f5e', c2: '#fb7185', soft: '#fff1f2', text: '#e11d48' };

const dayMs = 86400000;
const toDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const parseDay = (s: string) => toDay(new Date(s));
const fmtFull = (s: string | null | undefined) => (s ? s.slice(0, 10) : '—');
const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];

const HEAT_COLORS = ['#f1f5f9', '#c7d2fe', '#a5b4fc', '#fda4af', '#fb7185', '#e11d48'];
const heatColor = (n: number) => HEAT_COLORS[Math.min(n, HEAT_COLORS.length - 1)];

/* ================= 主页面 ================= */

export default function TimelinePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [zoom, setZoom] = useState<Zoom>('week');
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setProjects(await api.projects.list());
      setError('');
    } catch (e) {
      setError(`加载失败：${(e as Error).message}`);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const today = toDay(new Date());
  const overdueCount = projects.filter(
    (p) => p.ddl && p.status !== 'done' && p.status !== 'archived' && parseDay(p.ddl) < today,
  ).length;
  const followDue = projects.filter(
    (p) => p.next_follow_date && p.status !== 'done' && parseDay(p.next_follow_date) <= today,
  ).length;

  const header = (inModal: boolean) => (
    <div className="px-6 py-3 bg-white border-b border-slate-200 flex items-center gap-4 shrink-0">
      <h2 className="text-sm font-semibold text-slate-800">任务全景{inModal && ' · 全景模式'}</h2>
      <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs">
        {(['week', 'month', 'quarter'] as const).map((z) => (
          <button
            key={z}
            onClick={() => setZoom(z)}
            className={`px-3 py-1 rounded-md transition-colors ${
              zoom === z ? 'bg-white shadow-sm text-indigo-600 font-medium' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {z === 'week' ? '周' : z === 'month' ? '月' : '季'}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3 text-xs">
        {overdueCount > 0 && (
          <span className="rounded-full bg-rose-50 text-rose-600 px-2.5 py-0.5 font-medium">⚠ 逾期 {overdueCount}</span>
        )}
        {followDue > 0 && (
          <span className="rounded-full bg-amber-50 text-amber-600 px-2.5 py-0.5 font-medium">◆ 今日待跟进 {followDue}</span>
        )}
      </div>
      <span className="flex-1" />
      {/* 图例 */}
      <div className="hidden md:flex items-center gap-3 text-[10px] text-slate-400">
        {(['main', 'side', 'follow'] as const).map((t) => (
          <span key={t} className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-[4px]" style={{ background: TYPE_STYLE[t].c1 }} />
            {TYPE_STYLE[t].label}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-[4px] bg-rose-500" /> 逾期
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rotate-45 bg-amber-500" /> 跟进日
        </span>
      </div>
      {inModal ? (
        <button
          onClick={() => setFullscreen(false)}
          className="rounded-lg bg-slate-100 text-slate-600 px-3 py-1.5 text-xs hover:bg-slate-200"
        >
          ✕ 关闭（Esc）
        </button>
      ) : (
        <button
          onClick={() => setFullscreen(true)}
          className="rounded-lg bg-indigo-600 text-white px-3 py-1.5 text-xs hover:bg-indigo-700 shadow-sm"
          title="全屏沉浸查看"
        >
          ⛶ 全景模式
        </button>
      )}
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {header(false)}
      {error && <div className="px-6 py-2 text-xs text-red-500 bg-red-50">{error}</div>}
      <TimelineChart projects={projects} zoom={zoom} density="page" />

      {fullscreen && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-sm flex">
          <div className="m-4 flex-1 rounded-2xl bg-white shadow-2xl flex flex-col overflow-hidden ring-1 ring-slate-900/10">
            {header(true)}
            <TimelineChart projects={projects} zoom={zoom} density="fullscreen" />
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= 全景图组件 ================= */

function TimelineChart({
  projects,
  zoom,
  density,
}: {
  projects: Project[];
  zoom: Zoom;
  density: Density;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number; p: Project } | null>(null);
  const [hoverRow, setHoverRow] = useState<number>(-1);

  const today = toDay(new Date());
  const px = (density === 'page' ? PX_PAGE : PX_FULL)[zoom];
  const rowH = density === 'page' ? 46 : 58;
  const barH = density === 'page' ? 24 : 30;
  const labelW = density === 'page' ? 200 : 250;

  const [back, forward] = ZOOM_DAYS[zoom];
  const startDay = new Date(today.getTime() + back * dayMs);
  const days = useMemo(
    () => Array.from({ length: forward - back + 1 }, (_, i) => new Date(startDay.getTime() + i * dayMs)),
    [zoom],
  );
  const xOf = (d: Date) => Math.round(((toDay(d).getTime() - startDay.getTime()) / dayMs) * px);

  const rows = useMemo(() => {
    const active = projects.filter((p) => p.status !== 'archived');
    const withDdl = active.filter((p) => p.ddl).sort((a, b) => (a.ddl! < b.ddl! ? -1 : 1));
    const followOnly = active.filter((p) => !p.ddl && p.next_follow_date);
    return [...withDdl, ...followOnly];
  }, [projects]);
  const unscheduled = useMemo(
    () => projects.filter((p) => !p.ddl && !p.next_follow_date && p.status !== 'done' && p.status !== 'archived'),
    [projects],
  );

  const heat = useMemo(
    () =>
      days.map((d) => {
        const t = d.getTime();
        return projects.filter(
          (p) =>
            p.ddl &&
            p.status !== 'done' &&
            p.status !== 'archived' &&
            parseDay(p.created_at).getTime() <= t &&
            t <= parseDay(p.ddl).getTime(),
        ).length;
      }),
    [days, projects],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = Math.max(0, xOf(today) - el.clientWidth * 0.35);
  }, [zoom, density, days.length]);

  const width = days.length * px;
  const height = rows.length * rowH;
  const todayX = xOf(today);
  const HEADER_H = 46;

  const styleOf = (p: Project) => {
    const isDone = p.status === 'done';
    const isOverdue = !isDone && !!p.ddl && parseDay(p.ddl) < today;
    const s = isDone ? DONE_STYLE : isOverdue ? OVERDUE_STYLE : (TYPE_STYLE[p.type] ?? TYPE_STYLE.main);
    const progress = p.total_count > 0 ? p.done_count / p.total_count : isDone ? 1 : 0;
    const x1 = p.ddl ? Math.max(xOf(parseDay(p.created_at)), 0) : 0;
    const x2 = p.ddl ? Math.min(xOf(parseDay(p.ddl)) + px, width) : null;
    const followX = p.next_follow_date ? xOf(parseDay(p.next_follow_date)) + px / 2 : null;
    const followOverdue = !isDone && !!p.next_follow_date && parseDay(p.next_follow_date) <= today;
    return { isDone, isOverdue, s, progress, x1, x2, followX, followOverdue };
  };

  let gradSeq = 0;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 flex min-h-0">
        {/* 左侧泳道标签 */}
        <div className="shrink-0 bg-white border-r border-slate-200 flex flex-col z-20" style={{ width: labelW }}>
          <div
            className="border-b border-slate-200 flex items-end px-4 pb-2 text-[10px] text-slate-400"
            style={{ height: HEADER_H }}
          >
            {rows.length} 个项目
          </div>
          <div className="flex-1 overflow-hidden">
            {rows.map((p, i) => {
              const m = styleOf(p);
              return (
                <div
                  key={p.id}
                  className={`flex flex-col justify-center px-4 gap-1 transition-colors ${
                    hoverRow === i ? 'bg-indigo-50/60' : i % 2 ? 'bg-slate-50/60' : ''
                  }`}
                  style={{ height: rowH }}
                  onMouseEnter={() => setHoverRow(i)}
                  onMouseLeave={() => setHoverRow(-1)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[13px] font-medium text-slate-800 truncate">{p.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="text-[9px] rounded-full px-1.5 py-px font-medium"
                      style={{ background: m.s.soft, color: m.s.text }}
                    >
                      {m.isDone ? '已完成' : m.isOverdue ? '已逾期' : TYPE_STYLE[p.type]?.label}
                    </span>
                    {p.total_count > 0 && (
                      <span className="text-[10px] text-slate-400">
                        {p.done_count}/{p.total_count}
                      </span>
                    )}
                    {p.ddl && (
                      <span className="text-[10px] text-slate-400">· {fmtFull(p.ddl).slice(5)} 止</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 时间轴区 */}
        <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-auto relative bg-white">
          <div style={{ width, height: height + HEADER_H }} className="relative">
            {/* 表头：月带 + 日 */}
            <div className="border-b border-slate-200 relative bg-white sticky top-0 z-10" style={{ height: HEADER_H }}>
              {days.map((d, i) => {
                const isToday = d.getTime() === today.getTime();
                const monthStart = d.getDate() === 1 || i === 0;
                return (
                  <div key={i} className="absolute top-0 bottom-0" style={{ left: i * px, width: px }}>
                    {monthStart && (
                      <span className="absolute left-1.5 top-1 text-[11px] font-semibold text-slate-600">
                        {d.getMonth() + 1}月
                      </span>
                    )}
                    {px >= 16 && (
                      <div
                        className={`absolute left-1/2 -translate-x-1/2 bottom-1 flex flex-col items-center leading-none ${
                          isToday ? '' : ''
                        }`}
                      >
                        {isToday ? (
                          <span className="rounded-md bg-rose-500 text-white text-[9px] font-semibold px-1.5 py-[3px] shadow-sm">
                            今天
                          </span>
                        ) : (
                          <>
                            <span className={`text-[9px] ${d.getDay() === 0 || d.getDay() === 6 ? 'text-rose-300' : 'text-slate-300'}`}>
                              {WEEK_CN[d.getDay()]}
                            </span>
                            <span className="text-[10px] font-medium text-slate-500 mt-px">{d.getDate()}</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <svg width={width} height={height} className="block" style={{ position: 'absolute', top: HEADER_H }}>
              <defs>
                {rows.map((p, i) => {
                  const m = styleOf(p);
                  const id = `g${gradSeq++}`;
                  return (
                    <linearGradient key={p.id} id={id} x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={m.s.c1} />
                      <stop offset="100%" stopColor={m.s.c2} />
                    </linearGradient>
                  );
                })}
              </defs>

              {/* 周末底纹 */}
              {days.map((d, i) =>
                d.getDay() === 0 || d.getDay() === 6 ? (
                  <rect key={i} x={i * px} y={0} width={px} height={height} fill="#f8fafc" />
                ) : null,
              )}
              {/* 行条纹 + 行悬停 */}
              {rows.map((_, i) =>
                hoverRow === i ? (
                  <rect key={i} x={0} y={i * rowH} width={width} height={rowH} fill="#eef2ff" opacity={0.55} />
                ) : i % 2 ? (
                  <rect key={i} x={0} y={i * rowH} width={width} height={rowH} fill="#f8fafc" opacity={0.7} />
                ) : null,
              )}
              {/* 今日列浅底 */}
              <rect x={todayX} y={0} width={px} height={height} fill="#fff1f2" opacity={0.6} />
              {/* 月初分隔线 */}
              {days.map((d, i) =>
                d.getDate() === 1 ? (
                  <line key={i} x1={i * px} y1={0} x2={i * px} y2={height} stroke="#e2e8f0" strokeWidth={1} />
                ) : null,
              )}
              {/* 今日竖线 */}
              <line x1={todayX + px / 2} y1={0} x2={todayX + px / 2} y2={height} stroke="#f43f5e" strokeWidth={1.5} />

              {/* 项目条 */}
              {rows.map((p, i) => {
                const m = styleOf(p);
                const gradId = `g${i}`;
                const y = i * rowH + (rowH - barH) / 2;
                return (
                  <g
                    key={p.id}
                    onMouseEnter={(e) => {
                      setHoverRow(i);
                      const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                      setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top, p });
                    }}
                    onMouseMove={(e) => {
                      const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                      setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top, p });
                    }}
                    onMouseLeave={() => {
                      setHoverRow(-1);
                      setHover(null);
                    }}
                  >
                    {m.x2 !== null && (
                      <>
                        {/* 轨道：浅底 + 描边 */}
                        <rect
                          x={m.x1 + 2}
                          y={y}
                          width={Math.max(m.x2 - m.x1 - 4, 6)}
                          height={barH}
                          rx={6}
                          fill={m.s.c1}
                          opacity={0.1}
                          stroke={m.s.c1}
                          strokeOpacity={0.45}
                          strokeWidth={1.2}
                        />
                        {/* 进度：渐变实心 */}
                        {m.progress > 0 && (
                          <rect
                            x={m.x1 + 2}
                            y={y}
                            width={Math.max((m.x2 - m.x1 - 4) * m.progress, 6)}
                            height={barH}
                            rx={6}
                            fill={`url(#${gradId})`}
                          />
                        )}
                        {/* 逾期：实心渐变 + 白字 */}
                        {m.isOverdue && (
                          <>
                            <rect
                              x={m.x1 + 2}
                              y={y}
                              width={Math.max(m.x2 - m.x1 - 4, 6)}
                              height={barH}
                              rx={6}
                              fill={`url(#${gradId})`}
                              opacity={0.9}
                            />
                            <text
                              x={m.x1 + 12}
                              y={y + barH / 2 + 4}
                              fontSize={11}
                              fontWeight={600}
                              fill="#ffffff"
                            >
                              ⚠ 已逾期
                            </text>
                          </>
                        )}
                        {/* 条内文字：进度百分比 */}
                        {!m.isOverdue && p.total_count > 0 && m.x2 - m.x1 > 70 && (
                          <text x={m.x1 + 12} y={y + barH / 2 + 4} fontSize={11} fontWeight={600} fill={m.s.text}>
                            {Math.round(m.progress * 100)}%
                          </text>
                        )}
                        {/* 条内项目名（宽条且非逾期） */}
                        {!m.isOverdue && m.x2 - m.x1 > 150 && (
                          <text
                            x={m.x1 + (p.total_count > 0 ? 56 : 12)}
                            y={y + barH / 2 + 4}
                            fontSize={11}
                            fill="#475569"
                          >
                            {p.name.length > 14 ? p.name.slice(0, 14) + '…' : p.name}
                          </text>
                        )}
                      </>
                    )}
                    {/* ddl 旗标 */}
                    {p.ddl && m.x2 !== null && (
                      <g transform={`translate(${xOf(parseDay(p.ddl)) + px / 2}, ${i * rowH + rowH / 2})`}>
                        <rect
                          x={-5}
                          y={-5}
                          width={10}
                          height={10}
                          rx={2}
                          transform="rotate(45)"
                          fill={m.isOverdue ? '#be123c' : '#475569'}
                          stroke="#ffffff"
                          strokeWidth={1.5}
                        />
                      </g>
                    )}
                    {/* 纯跟进行（无 ddl）：虚线引导轨，让菱形不飘 */}
                    {m.x2 === null && m.followX !== null && (
                      <line
                        x1={Math.max(xOf(parseDay(p.created_at)), 4)}
                        y1={i * rowH + rowH / 2}
                        x2={Math.min(m.followX + px * 2, width - 4)}
                        y2={i * rowH + rowH / 2}
                        stroke={m.s.c1}
                        strokeOpacity={0.45}
                        strokeWidth={2}
                        strokeDasharray="3 5"
                        strokeLinecap="round"
                      />
                    )}
                    {/* 跟进日菱形 */}
                    {m.followX !== null && (
                      <g transform={`translate(${m.followX}, ${i * rowH + rowH / 2})`}>
                        <rect
                          x={-5}
                          y={-5}
                          width={10}
                          height={10}
                          transform="rotate(45)"
                          fill={m.followOverdue ? '#dc2626' : '#f59e0b'}
                          stroke="#ffffff"
                          strokeWidth={1.5}
                        >
                          {m.followOverdue && (
                            <animate attributeName="opacity" values="1;0.35;1" dur="1.6s" repeatCount="indefinite" />
                          )}
                        </rect>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* hover 详情卡 */}
            {hover && (
              <div
                className="absolute z-30 w-72 rounded-2xl bg-white shadow-2xl border border-slate-200 px-4 py-3.5 pointer-events-none"
                style={{
                  left: Math.min(hover.x + 18, width - 300),
                  top: hover.y + HEADER_H + 8,
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-slate-800 flex-1 truncate">{hover.p.name}</span>
                  <span
                    className="text-[10px] rounded-full px-2 py-0.5 font-medium shrink-0"
                    style={{ background: styleOf(hover.p).s.soft, color: styleOf(hover.p).s.text }}
                  >
                    {hover.p.status === 'done' ? '已完成' : styleOf(hover.p).isOverdue ? '已逾期' : TYPE_STYLE[hover.p.type]?.label}
                  </span>
                </div>
                <div className="mt-2.5 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.round(styleOf(hover.p).progress * 100)}%`,
                      background: `linear-gradient(90deg, ${styleOf(hover.p).s.c1}, ${styleOf(hover.p).s.c2})`,
                    }}
                  />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-500">
                  <span>进度 {hover.p.done_count}/{hover.p.total_count || '—'}</span>
                  <span>优先级 P{hover.p.priority}</span>
                  <span>创建 {fmtFull(hover.p.created_at)}</span>
                  <span>截止 {fmtFull(hover.p.ddl)}</span>
                  {hover.p.person && <span>被催人 {hover.p.person}</span>}
                  {(hover.p.urge_count ?? 0) > 0 && <span>已催 {hover.p.urge_count} 次</span>}
                  {hover.p.next_follow_date && (
                    <span className="col-span-2 text-amber-600">◆ 下次跟进 {fmtFull(hover.p.next_follow_date)}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 底部：密度热图 + 未排期 */}
      <div className="bg-white border-t border-slate-200 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-medium text-slate-500 shrink-0 w-16">负载热图</span>
          <div className="flex gap-1 overflow-x-auto flex-1 py-0.5">
            {days.map((d, i) => (
              <div
                key={i}
                title={`${d.getMonth() + 1}/${d.getDate()}：${heat[i]} 个进行中项目`}
                className="rounded-[4px] shrink-0 cursor-pointer transition-transform hover:scale-125"
                style={{
                  width: 14,
                  height: 14,
                  background: heatColor(heat[i]),
                  boxShadow: 'inset 0 0 0 1px rgba(15,23,42,0.05)',
                }}
                onClick={() => {
                  const el = scrollRef.current;
                  if (el) el.scrollTo({ left: i * px - el.clientWidth / 3, behavior: 'smooth' });
                }}
              />
            ))}
          </div>
        </div>
        {unscheduled.length > 0 && (
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-medium text-slate-500 shrink-0 w-16">未排期 {unscheduled.length}</span>
            {unscheduled.map((p) => (
              <span
                key={p.id}
                className="text-[10px] rounded-full bg-slate-50 border border-dashed border-slate-300 text-slate-500 px-2.5 py-0.5"
              >
                {p.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
