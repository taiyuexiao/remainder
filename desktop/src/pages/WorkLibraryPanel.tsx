import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, currentUserName, type KbProject, type Team } from '../api/client';
import KnowledgePanel from './KnowledgePanel';

/**
 * 工作库项目化面板（M25 / K2）：项目树（项目→子项目）+ 右侧条目区。
 * 未选中项目时显示「全部」；「未分配」= 没挂项目的条目。
 */
export default function WorkLibraryPanel({ team }: { team: Team }) {
  const [projects, setProjects] = useState<KbProject[]>([]);
  const [members, setMembers] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null | 'all'>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState<{ parentId: string | null } | null>(null);
  const [renaming, setRenaming] = useState<KbProject | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [ps, td] = await Promise.all([api.listKbProjects(team.id), api.getTeam(team.id)]);
      setProjects(ps);
      setMembers(td.members.map((m) => m.user_name));
      setError('');
    } catch (e) {
      setError(`加载失败：${(e as Error).message}`);
    }
  }, [team.id]);

  useEffect(() => {
    load();
  }, [load]);

  const roots = useMemo(() => projects.filter((p) => !p.parent_id), [projects]);
  const childrenOf = useCallback(
    (id: string) => projects.filter((p) => p.parent_id === id),
    [projects],
  );
  const parseOwners = (s: string): string[] => {
    try { return JSON.parse(s || '[]'); } catch { return []; }
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const removeProject = async (p: KbProject) => {
    if (!confirm(`删除项目「${p.name}」？须先清空子项目和条目。`)) return;
    try {
      await api.deleteKbProject(p.id);
      if (selected === p.id) setSelected('all');
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const renderRow = (p: KbProject, depth: number) => {
    const children = childrenOf(p.id);
    const isOpen = expanded.has(p.id);
    const owners = parseOwners(p.owners);
    return (
      <div key={p.id}>
        <div
          className={`group flex items-center gap-1 pr-2 py-1.5 cursor-pointer text-[13px] rounded-lg ${
            selected === p.id ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-700 hover:bg-slate-100'
          }`}
          style={{ paddingLeft: `${10 + depth * 16}px` }}
          onClick={() => setSelected(p.id)}
        >
          {children.length > 0 ? (
            <span
              className="w-4 text-[10px] text-slate-400 shrink-0"
              onClick={(e) => { e.stopPropagation(); toggleExpand(p.id); }}
            >
              {isOpen ? '▾' : '▸'}
            </span>
          ) : (
            <span className="w-4 shrink-0" />
          )}
          <span className="shrink-0">{depth === 0 ? '📁' : '📂'}</span>
          <span className="truncate flex-1">{p.name}</span>
          {owners.slice(0, 2).map((o) => (
            <span key={o} className="text-[9px] rounded-full bg-violet-50 text-violet-600 px-1 shrink-0">@{o}</span>
          ))}
          <span className="text-[10px] text-slate-300 shrink-0">{p.item_count || ''}</span>
          {/* hover 操作 */}
          <span className="hidden group-hover:flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              title="新建子项目"
              className="text-[11px] text-slate-400 hover:text-indigo-600"
              onClick={() => { setCreating({ parentId: p.id }); setExpanded((prev) => new Set(prev).add(p.id)); }}
            >
              ＋
            </button>
            <button title="重命名/@负责人" className="text-[11px] text-slate-400 hover:text-indigo-600" onClick={() => setRenaming(p)}>✎</button>
            <button title="删除" className="text-[11px] text-slate-400 hover:text-red-500" onClick={() => removeProject(p)}>🗑</button>
          </span>
        </div>
        {isOpen && children.map((c) => renderRow(c, depth + 1))}
      </div>
    );
  };

  const projectFilter = selected === 'all' ? undefined : selected;

  return (
    <div className="h-full flex">
      {/* 项目树 */}
      <div className="w-56 shrink-0 border-r border-slate-200 flex flex-col bg-white">
        <div className="px-3 py-2.5 border-b border-slate-100 flex items-center">
          <span className="text-xs font-medium text-slate-500 flex-1">项目</span>
          <button
            onClick={() => setCreating({ parentId: null })}
            className="text-[11px] text-indigo-600 hover:bg-indigo-50 rounded px-1.5 py-0.5"
          >
            ＋ 新建项目
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-1.5 px-1.5">
          <div
            className={`px-2.5 py-1.5 text-[13px] rounded-lg cursor-pointer ${
              selected === 'all' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-700 hover:bg-slate-100'
            }`}
            onClick={() => setSelected('all')}
          >
            📚 全部条目
          </div>
          {roots.map((p) => renderRow(p, 0))}
          <div
            className={`px-2.5 py-1.5 text-[13px] rounded-lg cursor-pointer ${
              selected === null ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-400 hover:bg-slate-100'
            }`}
            onClick={() => setSelected(null)}
          >
            🗂 未分配
          </div>
        </div>
        {error && <p className="px-3 py-2 text-[11px] text-red-500">{error}</p>}
      </div>

      {/* 条目区（复用 KnowledgePanel，按项目过滤） */}
      <div className="flex-1 min-w-0">
        <KnowledgePanel
          key={`${team.id}-work-${selected}`}
          team={team}
          layer="work"
          projectId={projectFilter}
          projects={projects}
          members={members}
        />
      </div>

      {/* 新建/重命名项目弹窗 */}
      {(creating || renaming) && (
        <ProjectFormModal
          team={team}
          members={members}
          parentId={creating?.parentId ?? null}
          existing={renaming}
          onClose={() => { setCreating(null); setRenaming(null); }}
          onSaved={() => { setCreating(null); setRenaming(null); load(); }}
        />
      )}
    </div>
  );
}

function ProjectFormModal({
  team,
  members,
  parentId,
  existing,
  onClose,
  onSaved,
}: {
  team: Team;
  members: string[];
  parentId: string | null;
  existing: KbProject | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? '');
  const [desc, setDesc] = useState(existing?.description ?? '');
  const [owners, setOwners] = useState<string[]>(() => {
    try { return JSON.parse(existing?.owners || '[]'); } catch { return []; }
  });
  const me = currentUserName() || '本机用户';

  const submit = async () => {
    if (!name.trim()) return;
    try {
      if (existing) {
        await api.updateKbProject(existing.id, { name: name.trim(), description: desc.trim(), owners });
      } else {
        await api.createKbProject({
          name: name.trim(),
          description: desc.trim(),
          team_id: team.id,
          parent_id: parentId,
          owners: owners.length ? owners : [me],
        });
      }
      onSaved();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-slate-900/30 flex items-center justify-center" onClick={onClose}>
      <div className="w-96 rounded-2xl bg-white shadow-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold">
          {existing ? '编辑项目' : parentId ? '新建子项目' : '新建项目'}
        </h3>
        <input
          autoFocus
          className="w-full rounded-lg bg-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-300"
          placeholder="项目名（如：评测平台建设）"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="w-full rounded-lg bg-slate-100 px-3 py-2 text-xs focus:outline-none"
          placeholder="一句话简介（可选）"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
        {members.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-slate-400">@负责人</span>
            {members.map((m) => (
              <button
                key={m}
                onClick={() => setOwners(owners.includes(m) ? owners.filter((x) => x !== m) : [...owners, m])}
                className={`rounded-full px-2 py-0.5 text-[11px] ${
                  owners.includes(m) ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-500'
                }`}
              >
                @{m}
              </button>
            ))}
          </div>
        )}
        <p className="text-[11px] text-slate-400">被 @ 的同事会收到必达通知。</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg bg-slate-100 text-slate-600 text-xs px-3 py-1.5 hover:bg-slate-200">取消</button>
          <button
            disabled={!name.trim()}
            onClick={submit}
            className="rounded-lg bg-indigo-600 text-white text-xs px-4 py-1.5 hover:bg-indigo-700 disabled:opacity-40"
          >
            {existing ? '保存' : '创建'}
          </button>
        </div>
      </div>
    </div>
  );
}
