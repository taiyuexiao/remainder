import { useCallback, useEffect, useState } from 'react';
import {
  api,
  currentUserName,
  KNOWLEDGE_TYPE_LABEL,
  type KnowledgeItemDetail,
  type KnowledgeType,
  type Publication,
  type Team,
  type TeamDetail,
  type TeamRole,
} from '../api/client';
import KnowledgePanel, { LAYERS, type LayerKey } from './KnowledgePanel';
import WorkLibraryPanel from './WorkLibraryPanel';

type Section = LayerKey | 'members' | 'inbox';

const ROLE_LABEL: Record<TeamRole, string> = { owner: '拥有者', admin: '管理员', member: '成员' };

/** 团队头像色：按 id 哈希取色 */
const AVATAR_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6'];
function avatarColor(id: string): string {
  if (id === 'personal') return '#64748b';
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/** 👥 团队空间（M24）：团队列表 → 层菜单 → 内容 三栏布局，参考 WPS Comate 团队空间 */
export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState(() => localStorage.getItem('teams-selected') ?? 'personal');
  const [section, setSection] = useState<Section>('intel');
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [inboxCount, setInboxCount] = useState(0);

  const loadTeams = useCallback(async () => {
    try {
      const list = await api.listTeams();
      setTeams(list);
      setError('');
      if (!list.some((t) => t.id === teamId)) setTeamId('personal');
    } catch (e) {
      setError(`团队加载失败：${(e as Error).message}`);
    }
  }, [teamId]);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  const selectTeam = (id: string) => {
    setTeamId(id);
    localStorage.setItem('teams-selected', id);
  };

  const team = teams.find((t) => t.id === teamId) ?? null;
  const isAdmin = team && (team.my_role === 'owner' || team.my_role === 'admin');

  // 收件箱未处理数角标（M27）
  useEffect(() => {
    if (!teamId) return;
    api.publicationCount(teamId).then((r) => setInboxCount(r.c)).catch(() => setInboxCount(0));
  }, [teamId, section]);

  return (
    <div className="h-full flex bg-white">
      {/* 第一栏：团队列表 */}
      <div className="w-52 shrink-0 border-r border-slate-200 flex flex-col bg-slate-50/60">
        <div className="px-4 py-3 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-800">👥 团队</h2>
          <p className="text-[10px] text-slate-400 mt-0.5">每个团队的知识资产相互隔离</p>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {teams.map((t) => (
            <button
              key={t.id}
              onClick={() => selectTeam(t.id)}
              className={`w-full text-left px-3 py-2 flex items-center gap-2.5 transition-colors ${
                teamId === t.id ? 'bg-indigo-50' : 'hover:bg-slate-100'
              }`}
            >
              <span
                className="w-7 h-7 rounded-lg text-white text-xs font-semibold flex items-center justify-center shrink-0"
                style={{ background: avatarColor(t.id) }}
              >
                {t.id === 'personal' ? '🏠' : t.name.slice(0, 1)}
              </span>
              <span className="flex-1 min-w-0">
                <span className={`block text-[13px] truncate ${teamId === t.id ? 'text-indigo-700 font-medium' : 'text-slate-700'}`}>
                  {t.name}
                </span>
                <span className="block text-[10px] text-slate-400">
                  {ROLE_LABEL[t.my_role]} · {t.item_count} 条
                </span>
              </span>
            </button>
          ))}
        </div>
        <div className="px-3 py-2.5 border-t border-slate-200 space-y-1.5">
          <button
            onClick={() => setShowCreate(true)}
            className="w-full rounded-lg bg-indigo-600 text-white text-xs px-3 py-1.5 hover:bg-indigo-700"
          >
            ＋ 新建团队
          </button>
          <button
            onClick={() => setShowJoin(true)}
            className="w-full rounded-lg bg-white border border-slate-200 text-slate-600 text-xs px-3 py-1.5 hover:bg-slate-50"
          >
            🔑 凭邀请码加入
          </button>
        </div>
      </div>

      {/* 第二栏：团队内菜单 */}
      {team && (
        <div className="w-44 shrink-0 border-r border-slate-200 flex flex-col">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-[13px] font-semibold text-slate-800 truncate">{team.name}</p>
            {team.description && <p className="text-[10px] text-slate-400 mt-0.5 truncate">{team.description}</p>}
          </div>
          <nav className="flex-1 py-2">
            {LAYERS.map((l) => (
              <button
                key={l.key}
                onClick={() => setSection(l.key)}
                className={`w-full text-left px-4 py-2 text-[13px] flex items-center gap-2 transition-colors ${
                  section === l.key
                    ? 'bg-indigo-50 text-indigo-700 font-medium border-r-2 border-indigo-500'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span>{l.icon}</span>
                <span>{l.label}</span>
              </button>
            ))}
            <div className="mx-4 my-2 border-t border-slate-100" />
            <button
              onClick={() => setSection('inbox')}
              className={`w-full text-left px-4 py-2 text-[13px] flex items-center gap-2 transition-colors ${
                section === 'inbox'
                  ? 'bg-indigo-50 text-indigo-700 font-medium border-r-2 border-indigo-500'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span>📥</span>
              <span className="flex-1">收件箱</span>
              {inboxCount > 0 && (
                <span className="rounded-full bg-rose-500 text-white text-[10px] px-1.5 py-px">{inboxCount}</span>
              )}
            </button>
            <button
              onClick={() => setSection('members')}
              className={`w-full text-left px-4 py-2 text-[13px] flex items-center gap-2 transition-colors ${
                section === 'members'
                  ? 'bg-indigo-50 text-indigo-700 font-medium border-r-2 border-indigo-500'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span>👤</span>
              <span>成员{isAdmin ? '与设置' : ''}</span>
            </button>
          </nav>
        </div>
      )}

      {/* 第三栏：内容 */}
      <div className="flex-1 min-w-0">
        {error && <div className="px-6 py-2 text-xs text-red-500 bg-red-50">{error}</div>}
        {!team ? (
          <p className="text-center text-sm text-slate-300 pt-20">选择或创建一个团队</p>
        ) : section === 'members' ? (
          <MembersPanel team={team} onChanged={loadTeams} />
        ) : section === 'inbox' ? (
          <InboxPanel team={team} onChanged={() => api.publicationCount(team.id).then((r) => setInboxCount(r.c)).catch(() => {})} />
        ) : section === 'work' ? (
          <WorkLibraryPanel key={team.id} team={team} />
        ) : (
          <KnowledgePanel key={`${team.id}-${section}`} team={team} layer={section} />
        )}
      </div>

      {showCreate && (
        <CreateTeamModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            selectTeam(id);
            loadTeams();
          }}
        />
      )}
      {showJoin && (
        <JoinTeamModal
          onClose={() => setShowJoin(false)}
          onJoined={(id) => {
            setShowJoin(false);
            selectTeam(id);
            loadTeams();
          }}
        />
      )}
    </div>
  );
}

/** 成员与团队设置面板 */
function MembersPanel({ team, onChanged }: { team: Team; onChanged: () => void }) {
  const [detail, setDetail] = useState<TeamDetail | null>(null);
  const [newName, setNewName] = useState('');
  const [editName, setEditName] = useState(team.name);
  const [editDesc, setEditDesc] = useState(team.description ?? '');
  const me = currentUserName() || '本机用户';
  const isPersonal = team.id === 'personal';
  const admin = team.my_role === 'owner' || team.my_role === 'admin';

  const load = useCallback(async () => {
    try {
      setDetail(await api.getTeam(team.id));
    } catch (e) {
      alert((e as Error).message);
    }
  }, [team.id]);

  useEffect(() => {
    setEditName(team.name);
    setEditDesc(team.description ?? '');
    load();
  }, [load, team.name, team.description]);

  const copyInvite = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      alert('邀请码已复制，发给同事即可');
    } catch {
      prompt('邀请码（手动复制）', token);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50 px-6 py-5">
      <div className="max-w-2xl space-y-4">
        {/* 成员列表 */}
        <div className="rounded-xl bg-white border border-slate-200 p-4">
          <h3 className="text-sm font-medium mb-3">成员（{detail?.members.length ?? (isPersonal ? '本机全部用户' : 0)}）</h3>
          {isPersonal && (
            <p className="text-xs text-slate-400">个人空间对本机所有用户开放，无需管理成员。知识资产隔离通过「新建团队」实现。</p>
          )}
          {detail?.members.map((m) => (
            <div key={m.user_name} className="flex items-center gap-2 py-1.5 border-b border-slate-50 last:border-0">
              <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-600 text-[10px] flex items-center justify-center">
                {m.user_name.slice(0, 1)}
              </span>
              <span className="text-[13px] text-slate-700 flex-1">
                {m.user_name}
                {m.user_name === me && <span className="text-[10px] text-indigo-500 ml-1">（我）</span>}
              </span>
              {admin && m.role !== 'owner' ? (
                <select
                  value={m.role}
                  onChange={async (e) => {
                    await api.updateTeamMember(team.id, m.user_name, e.target.value as TeamRole);
                    load();
                  }}
                  className="text-[11px] rounded border border-slate-200 px-1 py-0.5 text-slate-500"
                >
                  <option value="admin">管理员</option>
                  <option value="member">成员</option>
                </select>
              ) : (
                <span className="text-[11px] text-slate-400">{ROLE_LABEL[m.role]}</span>
              )}
              {admin && m.role !== 'owner' && (
                <button
                  onClick={async () => {
                    if (!confirm(`移除成员「${m.user_name}」？`)) return;
                    await api.removeTeamMember(team.id, m.user_name);
                    load();
                  }}
                  className="text-[11px] text-red-400 hover:text-red-600"
                >
                  移除
                </button>
              )}
            </div>
          ))}
          {admin && !isPersonal && (
            <div className="flex gap-2 mt-3">
              <input
                className="flex-1 rounded-lg bg-slate-100 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-300"
                placeholder="输入同事名字直接添加（对方连接本节点后即以该名字访问）"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <button
                onClick={async () => {
                  if (!newName.trim()) return;
                  await api.addTeamMember(team.id, newName.trim());
                  setNewName('');
                  load();
                }}
                className="rounded-lg bg-indigo-600 text-white text-xs px-3 py-1.5 hover:bg-indigo-700"
              >
                添加
              </button>
            </div>
          )}
        </div>

        {/* 邀请码（admin+ 且非个人空间） */}
        {admin && !isPersonal && detail?.invite_token && (
          <div className="rounded-xl bg-white border border-slate-200 p-4">
            <h3 className="text-sm font-medium mb-1">邀请码</h3>
            <p className="text-[11px] text-slate-400 mb-2">同事在「团队 → 凭邀请码加入」输入即可加入（需先连接到本节点）。</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg bg-slate-100 px-3 py-2 text-sm tracking-[0.2em] font-mono text-slate-700">
                {detail.invite_token}
              </code>
              <button
                onClick={() => copyInvite(detail.invite_token!)}
                className="rounded-lg bg-slate-100 text-slate-600 text-xs px-3 py-2 hover:bg-slate-200"
              >
                复制
              </button>
              <button
                onClick={async () => {
                  if (!confirm('重新生成后旧邀请码立即失效，继续？')) return;
                  const r = await api.rotateTeamInvite(team.id);
                  setDetail({ ...detail, invite_token: r.invite_token });
                }}
                className="rounded-lg bg-slate-100 text-slate-600 text-xs px-3 py-2 hover:bg-slate-200"
              >
                重新生成
              </button>
            </div>
          </div>
        )}

        {/* 团队设置（admin+ 且非个人空间） */}
        {admin && !isPersonal && (
          <div className="rounded-xl bg-white border border-slate-200 p-4 space-y-2">
            <h3 className="text-sm font-medium">团队设置</h3>
            <input
              className="w-full rounded-lg bg-slate-100 px-3 py-1.5 text-xs focus:outline-none"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="团队名"
            />
            <input
              className="w-full rounded-lg bg-slate-100 px-3 py-1.5 text-xs focus:outline-none"
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              placeholder="一句话简介（可选）"
            />
            <div className="flex gap-2 pt-1">
              <button
                onClick={async () => {
                  await api.updateTeam(team.id, { name: editName, description: editDesc });
                  onChanged();
                }}
                className="rounded-lg bg-indigo-600 text-white text-xs px-3 py-1.5 hover:bg-indigo-700"
              >
                保存
              </button>
              {team.my_role === 'owner' && (
                <button
                  onClick={async () => {
                    if (!confirm(`删除团队「${team.name}」？团队内需先清空知识条目。`)) return;
                    try {
                      await api.deleteTeam(team.id);
                      localStorage.setItem('teams-selected', 'personal');
                      onChanged();
                    } catch (e) {
                      alert((e as Error).message);
                    }
                  }}
                  className="rounded-lg bg-white border border-red-200 text-red-500 text-xs px-3 py-1.5 hover:bg-red-50"
                >
                  删除团队
                </button>
              )}
            </div>
          </div>
        )}
        {/* OKF 导出（M26，成员可用） */}
        <div className="rounded-xl bg-white border border-slate-200 p-4 flex items-center gap-3">
          <div className="flex-1">
            <h3 className="text-sm font-medium">导出 OKF 知识包</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">按 Google OKF v0.2 规范导出本团队全部条目（markdown + YAML frontmatter），任何 agent 可直接读。</p>
          </div>
          <button
            onClick={async () => {
              try {
                const r = await api.exportOkf(team.id);
                alert(`已导出 ${r.count} 条到：\n${r.dir}`);
              } catch (e) {
                alert((e as Error).message);
              }
            }}
            className="rounded-lg bg-slate-100 text-slate-600 text-xs px-3 py-1.5 hover:bg-slate-200 shrink-0"
          >
            📦 导出
          </button>
        </div>
      </div>
    </div>
  );
}

/** 收件箱面板（M27 / K4）：别人发布到本团队的条目，三选：仅查看/同步进本团队/忽略 */
function InboxPanel({ team, onChanged }: { team: Team; onChanged: () => void }) {
  const [pubs, setPubs] = useState<Publication[]>([]);
  const [viewing, setViewing] = useState<{ pub: Publication; item: KnowledgeItemDetail } | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setPubs(await api.listPublications(team.id));
      setError('');
      onChanged();
    } catch (e) {
      setError(`加载失败：${(e as Error).message}`);
    }
  }, [team.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
  }, [load]);

  const STATUS_META: Record<Publication['status'], { label: string; cls: string }> = {
    pending: { label: '待处理', cls: 'bg-rose-50 text-rose-600' },
    viewed: { label: '已查看', cls: 'bg-slate-100 text-slate-500' },
    synced: { label: '已同步', cls: 'bg-emerald-50 text-emerald-600' },
    ignored: { label: '已忽略', cls: 'bg-slate-100 text-slate-400' },
  };

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50 px-6 py-5">
      <div className="max-w-2xl">
        <h3 className="text-sm font-semibold text-slate-800 mb-1">📥 收件箱 · {team.name}</h3>
        <p className="text-[11px] text-slate-400 mb-4">其他团队发布过来的条目。发布 ≠ 复制：仅查看不给副本，「同步进本团队」才拉一份可编辑副本（上游更新可一键拉新）。</p>
        {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
        {pubs.length === 0 && <p className="text-center text-sm text-slate-300 pt-16">收件箱是空的</p>}
        <div className="space-y-2.5">
          {pubs.map((p) => {
            const m = p.item_type ? KNOWLEDGE_TYPE_LABEL[p.item_type as KnowledgeType] : null;
            const sm = STATUS_META[p.status];
            return (
              <div key={p.id} className="rounded-xl bg-white border border-slate-200 px-4 py-3">
                <div className="flex items-center gap-2">
                  {m && (
                    <span className="text-[10px] rounded-full px-2 py-0.5 font-medium" style={{ background: m.color + '1a', color: m.color }}>
                      {m.icon} {m.label}
                    </span>
                  )}
                  <span className="text-[13px] font-medium text-slate-800 truncate flex-1">{p.item_title}</span>
                  <span className={`text-[10px] rounded-full px-2 py-0.5 ${sm.cls}`}>{sm.label}</span>
                </div>
                <div className="mt-1 text-[11px] text-slate-400">
                  {p.from_author} · 来自「{p.from_team_name ?? p.from_team}」 · {p.published_at.slice(0, 10)}
                </div>
                {(p.status === 'pending' || p.status === 'viewed') && (
                  <div className="mt-2.5 flex gap-2">
                    <button
                      onClick={async () => {
                        const item = await api.viewPublication(p.id);
                        setViewing({ pub: p, item });
                        load();
                      }}
                      className="rounded-lg bg-slate-100 text-slate-600 text-xs px-3 py-1.5 hover:bg-slate-200"
                    >
                      👁 仅查看
                    </button>
                    <button
                      onClick={() => act(() => api.syncPublication(p.id))}
                      className="rounded-lg bg-indigo-600 text-white text-xs px-3 py-1.5 hover:bg-indigo-700"
                    >
                      📥 同步进本团队
                    </button>
                    <button
                      onClick={() => act(() => api.ignorePublication(p.id))}
                      className="rounded-lg bg-white border border-slate-200 text-slate-400 text-xs px-3 py-1.5 hover:bg-slate-50"
                    >
                      忽略
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 只读查看弹窗 */}
      {viewing && (
        <div className="fixed inset-0 z-40 bg-slate-900/30 flex items-center justify-center" onClick={() => setViewing(null)}>
          <div className="w-[560px] max-h-[80vh] rounded-2xl bg-white shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-800 flex-1 truncate">{viewing.item.title}</span>
              <span className="text-[10px] text-slate-400">只读 · 来自「{viewing.pub.from_team_name ?? viewing.pub.from_team}」</span>
              <button onClick={() => setViewing(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{viewing.item.content}</div>
            </div>
            <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
              <button onClick={() => setViewing(null)} className="rounded-lg bg-slate-100 text-slate-600 text-xs px-3 py-1.5 hover:bg-slate-200">关闭</button>
              {(viewing.pub.status === 'pending' || viewing.pub.status === 'viewed') && (
                <button
                  onClick={() => act(async () => { await api.syncPublication(viewing.pub.id); setViewing(null); })}
                  className="rounded-lg bg-indigo-600 text-white text-xs px-3 py-1.5 hover:bg-indigo-700"
                >
                  📥 同步进本团队
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateTeamModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  return (
    <div className="fixed inset-0 z-40 bg-slate-900/30 flex items-center justify-center" onClick={onClose}>
      <div className="w-96 rounded-2xl bg-white shadow-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold">新建团队</h3>
        <input
          autoFocus
          className="w-full rounded-lg bg-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-300"
          placeholder="团队名（如：后端一组 / XX项目组）"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="w-full rounded-lg bg-slate-100 px-3 py-2 text-sm focus:outline-none"
          placeholder="一句话简介（可选）"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
        <p className="text-[11px] text-slate-400">创建后你是拥有者，可在「成员」页获取邀请码邀请同事。</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg bg-slate-100 text-slate-600 text-xs px-3 py-1.5 hover:bg-slate-200">取消</button>
          <button
            disabled={!name.trim()}
            onClick={async () => {
              try {
                const r = await api.createTeam({ name: name.trim(), description: desc.trim() });
                onCreated(r.id);
              } catch (e) {
                alert((e as Error).message);
              }
            }}
            className="rounded-lg bg-indigo-600 text-white text-xs px-4 py-1.5 hover:bg-indigo-700 disabled:opacity-40"
          >
            创建
          </button>
        </div>
      </div>
    </div>
  );
}

function JoinTeamModal({ onClose, onJoined }: { onClose: () => void; onJoined: (id: string) => void }) {
  const [token, setToken] = useState('');
  return (
    <div className="fixed inset-0 z-40 bg-slate-900/30 flex items-center justify-center" onClick={onClose}>
      <div className="w-96 rounded-2xl bg-white shadow-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold">凭邀请码加入团队</h3>
        <input
          autoFocus
          className="w-full rounded-lg bg-slate-100 px-3 py-2 text-sm font-mono tracking-[0.2em] uppercase focus:outline-none focus:ring-1 focus:ring-indigo-300"
          placeholder="8 位邀请码"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <p className="text-[11px] text-slate-400">
          需先在「设置 → 联机共享」连接到团队节点，并填好「我的名字」。
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg bg-slate-100 text-slate-600 text-xs px-3 py-1.5 hover:bg-slate-200">取消</button>
          <button
            disabled={token.trim().length < 6}
            onClick={async () => {
              try {
                const r = await api.joinTeam(token.trim());
                onJoined(r.id);
              } catch (e) {
                alert((e as Error).message);
              }
            }}
            className="rounded-lg bg-indigo-600 text-white text-xs px-4 py-1.5 hover:bg-indigo-700 disabled:opacity-40"
          >
            加入
          </button>
        </div>
      </div>
    </div>
  );
}
