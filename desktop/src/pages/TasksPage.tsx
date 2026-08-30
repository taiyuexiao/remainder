import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  api,
  STATUS_LABEL,
  TYPE_LABEL,
  type Project,
  type ProjectType,
  type Task,
  type TaskStatus,
} from '../api/client';

const COLUMN_ORDER: ProjectType[] = ['main', 'side', 'follow'];
const COLUMN_STYLE: Record<ProjectType, string> = {
  main: 'bg-indigo-100 text-indigo-700',
  side: 'bg-emerald-100 text-emerald-700',
  follow: 'bg-amber-100 text-amber-700',
};

type Selection = { kind: 'project' | 'task'; id: string } | null;

const todayStr = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export default function TasksPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Selection>(null);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    try {
      const [ps, ts] = await Promise.all([api.projects.list(), api.listTasks()]);
      setProjects(ps);
      setTasks(ts);
      setError('');
    } catch (e) {
      setError(`后端连接失败：${(e as Error).message}`);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const projectsByType = useMemo(() => {
    const m = new Map<ProjectType, Project[]>();
    for (const t of COLUMN_ORDER) m.set(t, []);
    for (const p of projects) m.get(p.type)?.push(p);
    return m;
  }, [projects]);

  const subtasksByProject = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.project_id) continue;
      if (!m.has(t.project_id)) m.set(t.project_id, []);
      m.get(t.project_id)!.push(t);
    }
    return m;
  }, [tasks]);

  const ideas = useMemo(() => tasks.filter((t) => !t.project_id && t.type === 'idea'), [tasks]);

  const selectedProject = selected?.kind === 'project'
    ? projects.find((p) => p.id === selected.id) ?? null
    : null;
  const selectedTask = selected?.kind === 'task'
    ? tasks.find((t) => t.id === selected.id) ?? null
    : null;

  const toggleExpand = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="h-full flex">
      {/* 中间：项目文件夹 + 想法区 */}
      <section className="flex-1 min-w-0 flex flex-col border-r border-slate-200">
        <header className="px-6 py-4 bg-white border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold">全部任务</h2>
          <span className="text-xs text-slate-400">{projects.length} 个项目 · {ideas.length} 个想法</span>
        </header>

        {error && <div className="px-6 py-2 text-sm text-red-500 bg-red-50">{error}</div>}

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {COLUMN_ORDER.map((type) => (
            <ProjectColumn
              key={type}
              type={type}
              projects={projectsByType.get(type)!}
              subtasksByProject={subtasksByProject}
              expanded={expanded}
              onToggleExpand={toggleExpand}
              selected={selected}
              onSelect={setSelected}
              onChanged={reload}
            />
          ))}

          {/* 想法平铺区（不项目化） */}
          <IdeaSection
            ideas={ideas}
            selected={selected}
            onSelect={setSelected}
            onChanged={reload}
          />

          {!projects.length && !ideas.length && !error && (
            <p className="text-sm text-slate-400 text-center pt-16">暂无内容，新建一个项目或记录一个想法吧</p>
          )}
        </div>
      </section>

      {/* 右侧：详情/编辑 */}
      <aside className="w-80 shrink-0 bg-white overflow-y-auto">
        {selectedProject ? (
          <ProjectDetail
            key={selectedProject.id}
            project={selectedProject}
            onChange={reload}
            onClose={() => setSelected(null)}
          />
        ) : selectedTask ? (
          <TaskDetail
            key={selectedTask.id}
            task={selectedTask}
            onChange={reload}
            onClose={() => setSelected(null)}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-slate-300">
            选择项目或任务查看详情
          </div>
        )}
      </aside>
    </div>
  );
}

/* ---------------- 项目栏目 ---------------- */

function ProjectColumn({
  type,
  projects,
  subtasksByProject,
  expanded,
  onToggleExpand,
  selected,
  onSelect,
  onChanged,
}: {
  type: ProjectType;
  projects: Project[];
  subtasksByProject: Map<string, Task[]>;
  expanded: Record<string, boolean>;
  onToggleExpand: (id: string) => void;
  selected: Selection;
  onSelect: (s: Selection) => void;
  onChanged: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [ddl, setDdl] = useState('');
  const [priority, setPriority] = useState(2);
  const [person, setPerson] = useState('');
  const [nextFollowDate, setNextFollowDate] = useState('');

  const create = async () => {
    if (!name.trim()) return;
    try {
      await api.projects.create({
        name: name.trim(),
        type,
        ddl: ddl || null,
        priority,
        person: type === 'follow' ? person : undefined,
        nextFollowDate: type === 'follow' ? nextFollowDate : undefined,
      });
      setName(''); setDdl(''); setPriority(2); setPerson(''); setNextFollowDate('');
      setShowForm(false);
      onChanged();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const inputCls = 'rounded-lg border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300';

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-slate-400">
          {TYPE_LABEL[type]} · {projects.length}
        </h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs text-indigo-600 hover:underline"
        >
          + 新建项目
        </button>
      </div>

      {showForm && (
        <div className="mb-2 rounded-lg bg-white border border-slate-200 p-2.5 space-y-2">
          <div className="flex gap-2">
            <input
              autoFocus
              className={`flex-1 ${inputCls}`}
              placeholder={`新${TYPE_LABEL[type]}项目名称，回车创建`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
            />
            <input type="date" className={inputCls} value={ddl} onChange={(e) => setDdl(e.target.value)} />
            <select className={inputCls} value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
              <option value={1}>P1</option>
              <option value={2}>P2</option>
              <option value={3}>P3</option>
            </select>
            <button onClick={create} className="rounded-lg bg-indigo-600 text-white px-3 py-1 text-sm hover:bg-indigo-700">
              创建
            </button>
          </div>
          {type === 'follow' && (
            <div className="flex gap-2">
              <input
                className={`flex-1 border-amber-300 ${inputCls}`}
                placeholder="被催人（必填）"
                value={person}
                onChange={(e) => setPerson(e.target.value)}
              />
              <input
                type="date"
                className={`border-amber-300 ${inputCls}`}
                title="下次跟进日期"
                value={nextFollowDate}
                onChange={(e) => setNextFollowDate(e.target.value)}
              />
            </div>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        {projects.map((p) => (
          <ProjectFolder
            key={p.id}
            project={p}
            subtasks={subtasksByProject.get(p.id) ?? []}
            expanded={!!expanded[p.id]}
            onToggleExpand={() => onToggleExpand(p.id)}
            selected={selected}
            onSelect={onSelect}
            onChanged={onChanged}
          />
        ))}
        {!projects.length && (
          <p className="text-xs text-slate-300 px-1">暂无{TYPE_LABEL[type]}项目</p>
        )}
      </div>
    </div>
  );
}

/* ---------------- 项目文件夹 ---------------- */

function ProjectFolder({
  project: p,
  subtasks,
  expanded,
  onToggleExpand,
  selected,
  onSelect,
  onChanged,
}: {
  project: Project;
  subtasks: Task[];
  expanded: boolean;
  onToggleExpand: () => void;
  selected: Selection;
  onSelect: (s: Selection) => void;
  onChanged: () => void;
}) {
  const [newSub, setNewSub] = useState('');
  const overdue = p.ddl != null && p.ddl.slice(0, 10) < todayStr() && p.status !== 'done';
  const isSelected = selected?.kind === 'project' && selected.id === p.id;

  const addSubtask = async () => {
    if (!newSub.trim()) return;
    await api.createTask({ title: newSub.trim(), projectId: p.id });
    setNewSub('');
    onChanged();
  };

  const urge = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await api.urge(p.id);
    onChanged();
  };

  return (
    <div>
      {/* 项目文件夹行 */}
      <div
        onClick={() => { onSelect({ kind: 'project', id: p.id }); onToggleExpand(); }}
        className={`flex items-center gap-2.5 rounded-lg px-3 py-2 cursor-pointer border transition-colors ${
          isSelected
            ? 'bg-white border-indigo-300 shadow-sm'
            : 'bg-white/60 border-transparent hover:bg-white'
        }`}
      >
        <input
          type="checkbox"
          title="完成整个项目"
          checked={p.status === 'done'}
          onClick={(e) => e.stopPropagation()}
          onChange={() =>
            p.status === 'done'
              ? api.projects.update(p.id, { status: 'todo' }).then(onChanged)
              : api.projects.done(p.id).then(onChanged)
          }
          className="accent-indigo-600"
        />
        <button
          onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
          className="text-slate-400 text-xs w-4 shrink-0"
        >
          {expanded ? '▾' : '▸'}
        </button>
        <span className="shrink-0">📁</span>
        <span className={`text-sm font-medium truncate ${p.status === 'done' ? 'line-through text-slate-400' : ''}`}>
          {p.name}
        </span>
        {overdue && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" title="已逾期" />}
        <span className="text-xs text-slate-400 shrink-0">{p.done_count}/{p.total_count}</span>
        <span className="flex-1" />
        {p.type === 'follow' && (
          <>
            {p.person && <span className="text-xs text-amber-600 shrink-0">@{p.person}</span>}
            {p.next_follow_date && (
              <span className={`text-xs shrink-0 ${
                p.next_follow_date <= todayStr() && p.status !== 'done' ? 'text-red-500' : 'text-slate-400'
              }`}>
                跟进 {p.next_follow_date}
              </span>
            )}
            {p.urge_count ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 shrink-0">
                已催{p.urge_count}次
              </span>
            ) : null}
            <button
              onClick={urge}
              disabled={p.status === 'done'}
              className="shrink-0 rounded bg-amber-500 text-white px-2 py-0.5 text-xs hover:bg-amber-600 disabled:opacity-40"
            >
              再催
            </button>
          </>
        )}
        {p.ddl && <span className="text-xs text-slate-400 shrink-0">{p.ddl.slice(0, 10)}</span>}
        <span className="text-xs text-slate-300 shrink-0">P{p.priority}</span>
      </div>

      {/* 展开的子任务 */}
      {expanded && (
        <div className="ml-9 mt-1 space-y-1">
          {subtasks.map((t) => (
            <div
              key={t.id}
              onClick={() => onSelect({ kind: 'task', id: t.id })}
              className={`flex items-center gap-3 rounded-lg px-3 py-1.5 cursor-pointer border transition-colors ${
                selected?.kind === 'task' && selected.id === t.id
                  ? 'bg-white border-indigo-300 shadow-sm'
                  : 'bg-white/50 border-transparent hover:bg-white'
              }`}
            >
              <input
                type="checkbox"
                checked={t.status === 'done'}
                onClick={(e) => e.stopPropagation()}
                onChange={() =>
                  t.status === 'done'
                    ? api.updateTask(t.id, { status: 'todo' }).then(onChanged)
                    : api.doneTask(t.id).then(onChanged)
                }
                className="accent-indigo-600"
              />
              <span className={`flex-1 text-sm truncate ${t.status === 'done' ? 'line-through text-slate-400' : ''}`}>
                {t.title}
              </span>
              {t.ddl && <span className="text-xs text-slate-400">{t.ddl.slice(0, 10)}</span>}
              <span className="text-xs text-slate-300">P{t.priority}</span>
            </div>
          ))}
          <input
            className="w-full rounded-lg border border-dashed border-slate-300 bg-transparent px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            placeholder="+ 添加子任务，回车创建"
            value={newSub}
            onChange={(e) => setNewSub(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addSubtask()}
          />
        </div>
      )}
    </div>
  );
}

/* ---------------- 想法平铺区 ---------------- */

function IdeaSection({
  ideas,
  selected,
  onSelect,
  onChanged,
}: {
  ideas: Task[];
  selected: Selection;
  onSelect: (s: Selection) => void;
  onChanged: () => void;
}) {
  const [title, setTitle] = useState('');

  const add = async () => {
    if (!title.trim()) return;
    await api.createTask({ title: title.trim(), type: 'idea' });
    setTitle('');
    onChanged();
  };

  return (
    <div>
      <h3 className="text-xs font-semibold text-slate-400 mb-2">
        {TYPE_LABEL.idea} · {ideas.length}
      </h3>
      <div className="space-y-1.5">
        {ideas.map((t) => (
          <div
            key={t.id}
            onClick={() => onSelect({ kind: 'task', id: t.id })}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer border transition-colors ${
              selected?.kind === 'task' && selected.id === t.id
                ? 'bg-white border-indigo-300 shadow-sm'
                : 'bg-white/60 border-transparent hover:bg-white'
            }`}
          >
            <input
              type="checkbox"
              checked={t.status === 'done'}
              onClick={(e) => e.stopPropagation()}
              onChange={() =>
                t.status === 'done'
                  ? api.updateTask(t.id, { status: 'todo' }).then(onChanged)
                  : api.doneTask(t.id).then(onChanged)
              }
              className="accent-purple-600"
            />
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">💡</span>
            <span className={`flex-1 text-sm truncate ${t.status === 'done' ? 'line-through text-slate-400' : ''}`}>
              {t.title}
            </span>
            {t.ddl && <span className="text-xs text-slate-400">{t.ddl.slice(0, 10)}</span>}
          </div>
        ))}
        <input
          className="w-full rounded-lg border border-dashed border-slate-300 bg-transparent px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
          placeholder="+ 记录想法，回车创建"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
      </div>
    </div>
  );
}

/* ---------------- 右侧详情：项目 ---------------- */

const field = 'w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300';

function ProjectDetail({
  project,
  onChange,
  onClose,
}: {
  project: Project;
  onChange: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(project);

  const save = async () => {
    await api.projects.update(project.id, {
      name: draft.name,
      status: draft.status,
      priority: draft.priority,
      ddl: draft.ddl || null,
      milestone: draft.milestone,
      tags: draft.tags,
      note: draft.note,
      person: project.type === 'follow' ? draft.person ?? undefined : undefined,
      nextFollowDate: project.type === 'follow' ? draft.next_follow_date ?? undefined : undefined,
    });
    onChange();
  };

  return (
    <div className="p-5 space-y-3">
      <div className="flex items-center justify-between">
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${COLUMN_STYLE[project.type]}`}>
          📁 {TYPE_LABEL[project.type]}项目
        </span>
        <button onClick={onClose} className="text-slate-300 hover:text-slate-500">✕</button>
      </div>
      <input
        className={`${field} font-medium`}
        value={draft.name}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-slate-400">
          状态
          <select
            className={`${field} mt-1`}
            value={draft.status}
            onChange={(e) => setDraft({ ...draft, status: e.target.value as TaskStatus })}
          >
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-400">
          优先级
          <select
            className={`${field} mt-1`}
            value={draft.priority}
            onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })}
          >
            <option value={1}>P1 高</option>
            <option value={2}>P2 中</option>
            <option value={3}>P3 低</option>
          </select>
        </label>
      </div>
      <label className="block text-xs text-slate-400">
        截止日期
        <input
          type="date"
          className={`${field} mt-1`}
          value={(draft.ddl ?? '').slice(0, 10)}
          onChange={(e) => setDraft({ ...draft, ddl: e.target.value })}
        />
      </label>
      {project.type === 'main' && (
        <label className="block text-xs text-slate-400">
          里程碑
          <input
            className={`${field} mt-1`}
            value={draft.milestone}
            onChange={(e) => setDraft({ ...draft, milestone: e.target.value })}
          />
        </label>
      )}
      {project.type === 'follow' && (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-slate-400">
            被催人
            <input
              className={`${field} mt-1 border-amber-300`}
              value={draft.person ?? ''}
              onChange={(e) => setDraft({ ...draft, person: e.target.value })}
            />
          </label>
          <label className="text-xs text-slate-400">
            下次跟进
            <input
              type="date"
              className={`${field} mt-1 border-amber-300`}
              value={draft.next_follow_date ?? ''}
              onChange={(e) => setDraft({ ...draft, next_follow_date: e.target.value })}
            />
          </label>
        </div>
      )}
      <label className="block text-xs text-slate-400">
        标签（逗号分隔）
        <input
          className={`${field} mt-1`}
          value={draft.tags}
          onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
        />
      </label>
      <label className="block text-xs text-slate-400">
        备注
        <textarea
          className={`${field} mt-1 h-24 resize-none`}
          value={draft.note}
          onChange={(e) => setDraft({ ...draft, note: e.target.value })}
        />
      </label>
      <div className="flex gap-2 pt-1">
        <button
          onClick={save}
          className="flex-1 rounded-lg bg-indigo-600 text-white py-1.5 text-sm hover:bg-indigo-700"
        >
          保存
        </button>
        {project.status !== 'done' && (
          <button
            onClick={() => api.projects.done(project.id).then(onChange)}
            className="rounded-lg bg-emerald-50 text-emerald-700 px-3 py-1.5 text-sm hover:bg-emerald-100"
          >
            完成
          </button>
        )}
        <button
          onClick={() => {
            if (confirm('删除项目？子任务不会删除，会落入想法区。'))
              api.projects.delete(project.id).then(() => { onChange(); onClose(); });
          }}
          className="rounded-lg bg-red-50 text-red-600 px-3 py-1.5 text-sm hover:bg-red-100"
        >
          删除
        </button>
      </div>
      <p className="text-[10px] text-slate-300 pt-2">
        子任务 {project.done_count}/{project.total_count} · 创建于 {project.created_at.slice(0, 16).replace('T', ' ')}
      </p>
    </div>
  );
}

/* ---------------- 右侧详情：子任务/想法 ---------------- */

function TaskDetail({
  task,
  onChange,
  onClose,
}: {
  task: Task;
  onChange: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(task);

  const save = async () => {
    await api.updateTask(task.id, {
      title: draft.title,
      ddl: draft.ddl || null,
      priority: draft.priority,
      status: draft.status,
      tags: draft.tags,
      note: draft.note,
    });
    onChange();
  };

  return (
    <div className="p-5 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
          {task.project_name ? `📁 ${task.project_name} 的子任务` : `💡 ${TYPE_LABEL.idea}`}
        </span>
        <button onClick={onClose} className="text-slate-300 hover:text-slate-500">✕</button>
      </div>
      <input
        className={`${field} font-medium`}
        value={draft.title}
        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-slate-400">
          状态
          <select
            className={`${field} mt-1`}
            value={draft.status}
            onChange={(e) => setDraft({ ...draft, status: e.target.value as TaskStatus })}
          >
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-400">
          优先级
          <select
            className={`${field} mt-1`}
            value={draft.priority}
            onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })}
          >
            <option value={1}>P1 高</option>
            <option value={2}>P2 中</option>
            <option value={3}>P3 低</option>
          </select>
        </label>
      </div>
      <label className="block text-xs text-slate-400">
        截止日期
        <input
          type="date"
          className={`${field} mt-1`}
          value={(draft.ddl ?? '').slice(0, 10)}
          onChange={(e) => setDraft({ ...draft, ddl: e.target.value })}
        />
      </label>
      <label className="block text-xs text-slate-400">
        标签（逗号分隔）
        <input
          className={`${field} mt-1`}
          value={draft.tags}
          onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
        />
      </label>
      <label className="block text-xs text-slate-400">
        备注
        <textarea
          className={`${field} mt-1 h-24 resize-none`}
          value={draft.note}
          onChange={(e) => setDraft({ ...draft, note: e.target.value })}
        />
      </label>
      <div className="flex gap-2 pt-1">
        <button
          onClick={save}
          className="flex-1 rounded-lg bg-indigo-600 text-white py-1.5 text-sm hover:bg-indigo-700"
        >
          保存
        </button>
        {task.status !== 'done' && (
          <button
            onClick={() => api.doneTask(task.id).then(onChange)}
            className="rounded-lg bg-emerald-50 text-emerald-700 px-3 py-1.5 text-sm hover:bg-emerald-100"
          >
            完成
          </button>
        )}
        <button
          onClick={() => {
            if (confirm('确认删除？')) api.deleteTask(task.id).then(() => { onChange(); onClose(); });
          }}
          className="rounded-lg bg-red-50 text-red-600 px-3 py-1.5 text-sm hover:bg-red-100"
        >
          删除
        </button>
      </div>
      <p className="text-[10px] text-slate-300 pt-2">
        创建于 {task.created_at.slice(0, 16).replace('T', ' ')}
      </p>
    </div>
  );
}
