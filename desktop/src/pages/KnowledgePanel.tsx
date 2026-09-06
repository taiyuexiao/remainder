import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  api,
  currentUserName,
  KNOWLEDGE_CHANNELS,
  KNOWLEDGE_TYPE_LABEL,
  type KbComment,
  type KbProject,
  type KnowledgeItem,
  type KnowledgeItemDetail,
  type KnowledgeType,
  type Team,
} from '../api/client';

export type LayerKey = 'intel' | 'rfc' | 'exp' | 'work';

export const LAYERS: { key: LayerKey; label: string; icon: string; hint: string; types: KnowledgeType[] }[] = [
  { key: 'intel', label: '快讯', icon: '⚡', hint: 'AI 新闻 / 福利 / 工具更新 · 过期自动沉底', types: ['intel'] },
  { key: 'rfc', label: '探讨', icon: '💬', hint: '发起问题，讨论出结论后回填', types: ['rfc'] },
  { key: 'exp', label: '经验', icon: '📚', hint: '笔记 / 踩坑 / 推荐好文', types: ['note', 'share'] },
  { key: 'work', label: '工作库', icon: '📐', hint: '规范 / 接口契约 / 架构决策', types: ['guide', 'spec', 'adr'] },
];

const emptyForm = { type: 'note' as KnowledgeType, title: '', content: '', channels: [] as string[], tags: '', source_url: '' };

export function parseArr(s: string): string[] {
  try { return JSON.parse(s || '[]'); } catch { return []; }
}

/** 团队某一层的内容面板（M24：从 KnowledgePage 重构，层切换上移到团队空间二级菜单；M25：可选项目过滤） */
export default function KnowledgePanel({
  team,
  layer,
  projectId,
  projects,
  members,
}: {
  team: Team;
  layer: LayerKey;
  /** undefined=不过滤；null=未分配；否则=项目 id */
  projectId?: string | null;
  /** 工作库层传入：新建条目时的项目选择器 */
  projects?: KbProject[];
  /** 团队成员名（@负责人 chips） */
  members?: string[];
}) {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formProject, setFormProject] = useState<string | null>(projectId ?? null);
  const [formOwners, setFormOwners] = useState<string[]>([]);
  const [detail, setDetail] = useState<KnowledgeItemDetail | null>(null);
  const [conclusionInput, setConclusionInput] = useState('');
  const [comments, setComments] = useState<KbComment[]>([]);
  const [commentInput, setCommentInput] = useState('');
  const [replyTo, setReplyTo] = useState<KbComment | null>(null);
  const [publishing, setPublishing] = useState(false);

  const layerMeta = useMemo(() => LAYERS.find((l) => l.key === layer)!, [layer]);
  const currentTypes = layerMeta.types;

  const load = useCallback(async () => {
    try {
      const projectParam = projectId === undefined ? undefined : projectId ?? 'none';
      const all = await Promise.all(
        currentTypes.map((t) => api.listKnowledge({ type: t, q: q || undefined, team: team.id, project: projectParam })),
      );
      setItems(all.flat().sort((a, b) => (a.created_at < b.created_at ? 1 : -1)));
      setError('');
    } catch (e) {
      setError(`加载失败：${(e as Error).message}`);
    }
  }, [currentTypes, q, team.id, projectId]);

  useEffect(() => {
    setDetail(null);
    load();
  }, [load]);

  const openDetail = async (id: string) => {
    try {
      setDetail(await api.getKnowledge(id));
      setConclusionInput('');
      setReplyTo(null);
      setCommentInput('');
      setComments(await api.listComments(id));
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const submitCreate = async () => {
    if (!form.title.trim()) return;
    try {
      await api.createKnowledge({
        type: form.type,
        title: form.title.trim(),
        content: form.content,
        team_id: team.id,
        project_id: formProject,
        owners: formOwners,
        channels: form.channels,
        tags: form.tags.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
        source_url: form.source_url || undefined,
      });
      setCreating(false);
      setForm(emptyForm);
      setFormOwners([]);
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const typeMeta = (t: KnowledgeType) => KNOWLEDGE_TYPE_LABEL[t] ?? KNOWLEDGE_TYPE_LABEL.note;

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* 顶栏 */}
      <div className="px-6 py-3 bg-white border-b border-slate-200 flex items-center gap-3">
        <h2 className="text-sm font-semibold text-slate-800">
          {layerMeta.icon} {layerMeta.label}
        </h2>
        <input
          className="w-56 rounded-lg bg-slate-100 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-300"
          placeholder="搜索标题/正文/标签…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="flex-1" />
        <button
          onClick={() => {
            setForm({ ...emptyForm, type: currentTypes[0] });
            setFormProject(projectId ?? null);
            setFormOwners([]);
            setCreating(true);
          }}
          className="rounded-lg bg-indigo-600 text-white text-xs px-3 py-1.5 hover:bg-indigo-700"
        >
          + 新建条目
        </button>
      </div>
      <p className="px-6 py-1.5 text-[11px] text-slate-400 bg-white border-b border-slate-100">
        {team.name} · {layerMeta.hint}
      </p>
      {error && <div className="px-6 py-2 text-xs text-red-500 bg-red-50">{error}</div>}

      {/* 卡片列表 */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {items.length === 0 && (
          <p className="text-center text-sm text-slate-300 pt-16">这个层还没有条目，点右上角「+ 新建条目」写第一条</p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 max-w-6xl">
          {items.map((it) => {
            const m = typeMeta(it.type);
            return (
              <div
                key={it.id}
                onClick={() => openDetail(it.id)}
                className="rounded-xl bg-white border border-slate-200 px-4 py-3 cursor-pointer hover:shadow-md hover:border-indigo-200 transition-all"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="text-[10px] rounded-full px-2 py-0.5 font-medium shrink-0"
                    style={{ background: m.color + '1a', color: m.color }}
                  >
                    {m.icon} {m.label}
                  </span>
                  <span className="text-[13px] font-medium text-slate-800 truncate flex-1">{it.title}</span>
                  {it.upstream_has_update === 1 && (
                    <span className="text-[10px] rounded-full bg-amber-50 text-amber-600 px-1.5 py-px shrink-0">↻ 有新版本</span>
                  )}
                  {it.upstream_id && !it.upstream_has_update && (
                    <span className="text-[10px] text-slate-300 shrink-0" title="同步副本">⇄</span>
                  )}
                  {it.useful_count > 0 && (
                    <span className="text-[10px] text-amber-500 shrink-0">★{it.useful_count}</span>
                  )}
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-[10px] text-slate-400">
                  {it.author && <span>{it.author}</span>}
                  {parseArr(it.channels).map((c) => (
                    <span key={c} className="rounded bg-slate-100 px-1.5 py-px">#{c}</span>
                  ))}
                  {parseArr(it.tags).slice(0, 3).map((t) => (
                    <span key={t} className="text-slate-300">·{t}</span>
                  ))}
                  <span className="flex-1" />
                  {it.expires_at && (
                    <span className="text-amber-500/80">⏳ {it.expires_at.slice(0, 10)} 沉底</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 新建弹窗 */}
      {creating && (
        <div className="fixed inset-0 z-40 bg-slate-900/30 flex items-center justify-center" onClick={() => setCreating(false)}>
          <div className="w-[520px] rounded-2xl bg-white shadow-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">新建知识条目 · {team.name}</h3>
              <button onClick={() => setCreating(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="flex gap-2 flex-wrap">
              {currentTypes.map((t) => (
                <button
                  key={t}
                  onClick={() => setForm({ ...form, type: t })}
                  className={`rounded-lg px-2 py-1 text-xs ${
                    form.type === t ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {KNOWLEDGE_TYPE_LABEL[t].icon} {KNOWLEDGE_TYPE_LABEL[t].label}
                </button>
              ))}
            </div>
            <input
              autoFocus
              className="w-full rounded-lg bg-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-300"
              placeholder="标题"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
            <textarea
              className="w-full h-32 rounded-lg bg-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-300 resize-none"
              placeholder="正文（Markdown 自由格式；分享类必填一句「为什么值得看」）"
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
            />
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-slate-400">频道</span>
              {KNOWLEDGE_CHANNELS.map((c) => (
                <button
                  key={c}
                  onClick={() =>
                    setForm({
                      ...form,
                      channels: form.channels.includes(c)
                        ? form.channels.filter((x) => x !== c)
                        : [...form.channels, c],
                    })
                  }
                  className={`rounded-full px-2 py-0.5 text-[11px] ${
                    form.channels.includes(c) ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  #{c}
                </button>
              ))}
            </div>
            {layer === 'work' && projects && (
              <label className="block text-[11px] text-slate-400">
                所属项目
                <select
                  value={formProject ?? ''}
                  onChange={(e) => setFormProject(e.target.value || null)}
                  className="mt-1 w-full rounded-lg bg-slate-100 px-3 py-1.5 text-xs focus:outline-none"
                >
                  <option value="">未分配</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.parent_id ? '　└ ' : ''}{p.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {members && members.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] text-slate-400">@负责人</span>
                {members.map((m) => (
                  <button
                    key={m}
                    onClick={() =>
                      setFormOwners(
                        formOwners.includes(m) ? formOwners.filter((x) => x !== m) : [...formOwners, m],
                      )
                    }
                    className={`rounded-full px-2 py-0.5 text-[11px] ${
                      formOwners.includes(m) ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    @{m}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-lg bg-slate-100 px-3 py-1.5 text-xs focus:outline-none"
                placeholder="标签（逗号分隔）"
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
              />
              <span className="text-[11px] text-slate-400 self-center">作者：{currentUserName() || '本机用户'}</span>
            </div>
            <input
              className="w-full rounded-lg bg-slate-100 px-3 py-1.5 text-xs focus:outline-none"
              placeholder="来源链接（可选）"
              value={form.source_url}
              onChange={(e) => setForm({ ...form, source_url: e.target.value })}
            />
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setCreating(false)} className="rounded-lg bg-slate-100 text-slate-600 text-xs px-3 py-1.5 hover:bg-slate-200">
                取消
              </button>
              <button
                onClick={submitCreate}
                disabled={!form.title.trim()}
                className="rounded-lg bg-indigo-600 text-white text-xs px-4 py-1.5 hover:bg-indigo-700 disabled:opacity-40"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 详情侧栏 */}
      {detail && (
        <div className="fixed inset-0 z-40 flex justify-end" onClick={() => setDetail(null)}>
          <div
            className="w-[480px] max-w-full h-full bg-white shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
              <span
                className="text-[10px] rounded-full px-2 py-0.5 font-medium"
                style={{
                  background: typeMeta(detail.type).color + '1a',
                  color: typeMeta(detail.type).color,
                }}
              >
                {typeMeta(detail.type).icon} {typeMeta(detail.type).label}
              </span>
              <span className="text-sm font-semibold text-slate-800 flex-1 truncate">{detail.title}</span>
              <button onClick={() => setDetail(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="text-[11px] text-slate-400 space-x-2 mb-3">
                {detail.author && <span>作者 {detail.author}</span>}
                {parseArr(detail.owners).map((o) => <span key={o} className="rounded bg-violet-50 text-violet-600 px-1.5">@{o}</span>)}
                <span>{detail.created_at.slice(0, 10)}</span>
                {parseArr(detail.channels).map((c) => <span key={c} className="rounded bg-slate-100 px-1.5">#{c}</span>)}
              </div>
              {detail.source_url && (
                <a href={detail.source_url} target="_blank" rel="noopener" className="text-xs text-indigo-500 hover:underline break-all">
                  来源：{detail.source_url}
                </a>
              )}
              <div className="mt-3 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{detail.content}</div>
              {detail.type === 'rfc' && (
                <div className="mt-4 rounded-xl bg-violet-50 border border-violet-100 p-3">
                  <p className="text-xs font-medium text-violet-700 mb-1.5">结论</p>
                  {detail.status === 'concluded' ? (
                    <p className="text-xs text-slate-600 whitespace-pre-wrap">{detail.conclusion || '（未填写结论）'}</p>
                  ) : (
                    <>
                      <textarea
                        className="w-full h-16 rounded-lg bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-violet-300 resize-none"
                        placeholder="讨论出结论了吗？写在这里…"
                        value={conclusionInput}
                        onChange={(e) => setConclusionInput(e.target.value)}
                      />
                      <div className="flex gap-1.5 mt-2">
                        <button
                          onClick={async () => {
                            await api.concludeKnowledge(detail.id, conclusionInput);
                            setDetail(await api.getKnowledge(detail.id));
                            load();
                          }}
                          className="rounded-lg bg-violet-600 text-white text-[11px] px-2.5 py-1 hover:bg-violet-700"
                        >
                          ✓ 标记结论
                        </button>
                        <button
                          onClick={async () => {
                            await api.concludeKnowledge(detail.id, conclusionInput, 'note');
                            setDetail(null);
                            load();
                          }}
                          className="rounded-lg bg-white border border-emerald-300 text-emerald-600 text-[11px] px-2.5 py-1 hover:bg-emerald-50"
                        >
                          → 沉淀为经验
                        </button>
                        <button
                          onClick={async () => {
                            await api.concludeKnowledge(detail.id, conclusionInput, 'adr');
                            setDetail(null);
                            load();
                          }}
                          className="rounded-lg bg-white border border-rose-300 text-rose-600 text-[11px] px-2.5 py-1 hover:bg-rose-50"
                        >
                          → 沉淀为决策
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
              {/* 评论区（M26 / K3） */}
              <div className="mt-5 border-t border-slate-100 pt-3">
                <p className="text-xs font-medium text-slate-500 mb-2">评论（{comments.length}）</p>
                {comments.filter((c) => !c.parent_id).map((c) => (
                  <div key={c.id} className="mb-2.5">
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <div className="flex items-center gap-2 text-[10px] text-slate-400">
                        <span className="font-medium text-slate-600">{c.author}</span>
                        <span>{c.created_at.slice(0, 10)}</span>
                        <span className="flex-1" />
                        <button
                          className="hover:text-indigo-600"
                          onClick={() => { setReplyTo(c); setCommentInput(`@${c.author} `); }}
                        >
                          回复
                        </button>
                        {c.author === (currentUserName() || '本机用户') && (
                          <button
                            className="hover:text-red-500"
                            onClick={async () => { await api.deleteComment(c.id); setComments(await api.listComments(detail.id)); }}
                          >
                            删除
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-slate-700 mt-1 whitespace-pre-wrap">{c.content}</p>
                    </div>
                    {comments.filter((r) => r.parent_id === c.id).map((r) => (
                      <div key={r.id} className="ml-5 mt-1.5 rounded-lg bg-slate-50/70 px-3 py-1.5">
                        <div className="flex items-center gap-2 text-[10px] text-slate-400">
                          <span className="font-medium text-slate-600">{r.author}</span>
                          <span>{r.created_at.slice(0, 10)}</span>
                          <span className="flex-1" />
                          {r.author === (currentUserName() || '本机用户') && (
                            <button
                              className="hover:text-red-500"
                              onClick={async () => { await api.deleteComment(r.id); setComments(await api.listComments(detail.id)); }}
                            >
                              删除
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-slate-700 mt-0.5 whitespace-pre-wrap">{r.content}</p>
                      </div>
                    ))}
                  </div>
                ))}
                {/* 输入区 */}
                {replyTo && (
                  <p className="text-[10px] text-violet-500 mb-1">
                    回复 {replyTo.author}：{replyTo.content.slice(0, 30)}
                    <button className="ml-1 text-slate-400" onClick={() => setReplyTo(null)}>✕</button>
                  </p>
                )}
                {members && members.length > 1 && (
                  <div className="flex gap-1.5 flex-wrap mb-1.5">
                    {members.filter((m) => m !== (currentUserName() || '本机用户')).map((m) => (
                      <button
                        key={m}
                        onClick={() => setCommentInput((v) => v + `@${m} `)}
                        className="rounded-full bg-violet-50 text-violet-600 px-2 py-0.5 text-[10px] hover:bg-violet-100"
                      >
                        @{m}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <textarea
                    className="flex-1 h-14 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-300 resize-none"
                    placeholder="写下评论…（@同事 会收到必达通知）"
                    value={commentInput}
                    onChange={(e) => setCommentInput(e.target.value)}
                  />
                  <button
                    disabled={!commentInput.trim()}
                    onClick={async () => {
                      await api.createComment(detail.id, { content: commentInput.trim(), parent_id: replyTo?.id });
                      setCommentInput('');
                      setReplyTo(null);
                      setComments(await api.listComments(detail.id));
                    }}
                    className="self-end rounded-lg bg-indigo-600 text-white text-xs px-3 py-1.5 hover:bg-indigo-700 disabled:opacity-40"
                  >
                    发送
                  </button>
                </div>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-2">
              <button
                onClick={() => setPublishing(true)}
                className="rounded-lg bg-indigo-50 text-indigo-600 text-xs px-3 py-1.5 hover:bg-indigo-100"
              >
                📤 发布
              </button>
              {detail.upstream_id && (
                <button
                  onClick={async () => {
                    try {
                      await api.pullKnowledge(detail.id);
                      setDetail(await api.getKnowledge(detail.id));
                      load();
                    } catch (e) {
                      alert((e as Error).message);
                    }
                  }}
                  disabled={!detail.upstream_has_update}
                  className="rounded-lg bg-amber-50 text-amber-600 text-xs px-3 py-1.5 hover:bg-amber-100 disabled:opacity-40"
                  title={detail.upstream_has_update ? '上游有新版本，点击拉取' : '同步副本（与上游一致）'}
                >
                  ⇄ 拉取上游
                </button>
              )}
              <button
                onClick={async () => {
                  await api.usefulKnowledge(detail.id);
                  setDetail(await api.getKnowledge(detail.id));
                  load();
                }}
                className="rounded-lg bg-amber-50 text-amber-600 text-xs px-3 py-1.5 hover:bg-amber-100"
              >
                ★ 有用（{detail.useful_count}）
              </button>
              <span className="flex-1" />
              <button
                onClick={async () => {
                  if (!confirm('删除该条目？')) return;
                  await api.deleteKnowledge(detail.id);
                  setDetail(null);
                  load();
                }}
                className="rounded-lg bg-slate-100 text-red-500 text-xs px-3 py-1.5 hover:bg-red-50"
              >
                🗑 删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 发布到团队弹窗（M27） */}
      {publishing && detail && (
        <PublishModal
          itemId={detail.id}
          currentTeam={detail.team_id}
          onClose={() => setPublishing(false)}
          onPublished={() => { setPublishing(false); alert('已发布到对方团队收件箱'); }}
        />
      )}
    </div>
  );
}

/** 发布条目到其他团队（M27 / K4）：发布=给可见权+进对方收件箱 */
function PublishModal({
  itemId,
  currentTeam,
  onClose,
  onPublished,
}: {
  itemId: string;
  currentTeam: string;
  onClose: () => void;
  onPublished: () => void;
}) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.listTeams().then((list) => setTeams(list.filter((t) => t.id !== currentTeam))).catch(() => {});
  }, [currentTeam]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/30 flex items-center justify-center" onClick={onClose}>
      <div className="w-96 rounded-2xl bg-white shadow-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold">📤 发布到团队</h3>
        <p className="text-[11px] text-slate-400">
          发布 ≠ 复制：对方团队在收件箱看到后，可自行选择仅查看或同步副本（fork）。
        </p>
        {teams.length === 0 && <p className="text-xs text-slate-400 py-4 text-center">你没有其他团队可发布</p>}
        <div className="space-y-1.5 max-h-56 overflow-y-auto">
          {teams.map((t) => (
            <button
              key={t.id}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api.publishKnowledge(itemId, t.id);
                  onPublished();
                } catch (e) {
                  alert((e as Error).message);
                  setBusy(false);
                }
              }}
              className="w-full text-left rounded-lg border border-slate-200 px-3 py-2 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors disabled:opacity-50"
            >
              <span className="text-[13px] text-slate-700">{t.name}</span>
              <span className="block text-[10px] text-slate-400">{t.member_count} 名成员</span>
            </button>
          ))}
        </div>
        <div className="flex justify-end">
          <button onClick={onClose} className="rounded-lg bg-slate-100 text-slate-600 text-xs px-3 py-1.5 hover:bg-slate-200">取消</button>
        </div>
      </div>
    </div>
  );
}
