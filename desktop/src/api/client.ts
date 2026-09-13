const API = import.meta.env.VITE_API_BASE ?? localStorage.getItem('api-base') ?? 'http://127.0.0.1:3210';

/** API base（拼剪藏图片等相对路径用；联机模式下指向团队节点） */
export const API_BASE = API;

/** 联机共享 token（非回环节点必填） */
const teamToken = () => localStorage.getItem('team-token') ?? '';

/** 当前用户名（M24 团队身份，LAN 信任制） */
export const currentUserName = () => localStorage.getItem('user-name')?.trim() || '';

export type TaskType = 'main' | 'side' | 'follow' | 'idea';
export type ProjectType = 'main' | 'side' | 'follow';
export type TaskStatus = 'todo' | 'doing' | 'done' | 'archived';

/** 项目文件夹（M10）：类型/状态/优先级/ddl/里程碑/跟进数据都挂在项目级 */
export interface Project {
  id: string;
  name: string;
  type: ProjectType;
  status: TaskStatus;
  priority: number;
  ddl: string | null;
  milestone: string;
  tags: string;
  note: string;
  created_at: string;
  updated_at: string;
  done_at: string | null;
  // 子任务进度
  done_count: number;
  total_count: number;
  // follow 型项目通过 LEFT JOIN follow_ups 附带
  person?: string | null;
  next_follow_date?: string | null;
  urge_count?: number | null;
  last_urged_at?: string | null;
}

/** 子任务/平铺想法：纯执行颗粒，type 从项目继承或为 idea */
export interface Task {
  id: string;
  title: string;
  type: TaskType;
  status: TaskStatus;
  priority: number;
  ddl: string | null;
  milestone: string;
  tags: string;
  note: string;
  created_at: string;
  updated_at: string;
  done_at: string | null;
  project_id: string | null;
  project_name?: string | null;
  // today 视图混排展示时 followUps 段有 person，这里放宽便于统一渲染
  person?: string | null;
}

/** 今日视图的 followUps 段：follow 型项目行（projects.* + p.name AS title，无 project_id/计数字段） */
export type FollowTask = Omit<Project, 'done_count' | 'total_count'> & {
  title: string;
  project_name?: string | null;
};

/** today 视图混排条目：子任务/想法 或 follow 型项目 */
export type TodayEntry = Task | FollowTask;

export interface TodayView {
  date: string;
  overdue: Task[];
  today: Task[];
  followUps: FollowTask[];
}

export interface InboxItem {
  id: string;
  content: string;
  tags: string;
  created_at: string;
  converted_task_id: string | null;
}

/** 剪藏箱条目（列表行为轻行，无 content_html；详情走 getClip） */
export interface Clip {
  id: string;
  url: string;
  title: string;
  content_html?: string;
  excerpt: string;
  source: 'extension' | 'clipboard';
  status: 'inbox' | 'converted';
  converted_doc_id: string | null;
  created_at: string;
}

export interface NotificationItem {  id: string;
  taskId: string;
  title: string;
  fireAt: string;
}

export interface Document {
  id: string;
  title: string;
  content: string;
  // 知识库元数据（M11.4）
  tags: string;
  source_url: string;
  summary: string;
  clip_id: string | null;
  folder_id: string | null;
  created_at: string;
  updated_at: string;
  /** 搜索结果行才有 */
  rank?: number;
}

export interface DocumentInput {
  title: string;
  content?: string;
  tags?: string;
  source_url?: string;
  summary?: string;
  folderId?: string | null;
}

export interface DocFolder {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** 搜索结果行（无 content 的轻行） */
export type DocumentSearchRow = Omit<Document, 'content'> & { content?: string };

export interface TaskInput {
  title: string;
  type?: 'idea'; // 不传 projectId 时只能是 idea
  projectId?: string; // 传 → 子任务，type 从项目继承
  ddl?: string | null;
  priority?: number;
  tags?: string;
  note?: string;
}

export interface ConvertInput {
  type?: TaskType;
  title?: string;
  projectId?: string;
  ddl?: string | null;
  priority?: number;
  person?: string;
  nextFollowDate?: string;
}

export interface ProjectInput {
  name: string;
  type: ProjectType;
  ddl?: string | null;
  priority?: number;
  milestone?: string;
  tags?: string;
  note?: string;
  person?: string;
  nextFollowDate?: string;
}

export interface CanvasBoard {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface CanvasItem {
  id: string;
  board_id: string;
  type: 'text' | 'image' | 'clip';
  x: number;
  y: number;
  w: number;
  h: number;
  content: string;
  source_url: string;
  created_at: string;
  updated_at: string;
}

export interface CanvasBoardWithItems extends CanvasBoard {
  items: CanvasItem[];
}

export interface Report {
  id: string;
  type: 'daily' | 'weekly' | 'monthly';
  date: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface TaskRangeData {
  date: string;
  overdue: Task[];
  today: Task[];
  followUps: FollowTask[];
  doneProjects?: Project[];
  doneTasks?: Task[];
  doingProjects?: Project[];
  overdueTasks?: Task[];
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = teamToken();
  if (token) headers['x-team-token'] = token;
  const user = currentUserName();
  if (user) headers['x-user-name'] = encodeURIComponent(user); // CJK 名需编码，HTTP 头仅允许 Latin-1
  const r = await fetch(`${API}${path}`, {
    headers,
    ...init,
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
  }
  return r.json() as Promise<T>;
}

function qsOf(q?: Record<string, string | undefined>) {
  const qs = new URLSearchParams(
    Object.entries(q ?? {}).filter(([, v]) => v) as [string, string][],
  ).toString();
  return qs ? `?${qs}` : '';
}

export const api = {
  health: () => req<{ status: string }>('/api/health'),
  listTasks: (q?: { projectId?: string; type?: string; status?: string; date?: string }) =>
    req<Task[]>(`/api/tasks${qsOf(q)}`),
  today: () => req<TodayView>('/api/tasks/today'),
  createTask: (b: TaskInput) => req<Task>('/api/tasks', { method: 'POST', body: JSON.stringify(b) }),
  updateTask: (id: string, b: Partial<TaskInput & { status: TaskStatus }>) =>
    req<Task>(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  doneTask: (id: string) => req<Task>(`/api/tasks/${id}/done`, { method: 'POST' }),
  deleteTask: (id: string) => req<{ deleted: string }>(`/api/tasks/${id}`, { method: 'DELETE' }),
  projects: {
    list: (q?: { type?: string; status?: string }) => req<Project[]>(`/api/projects${qsOf(q)}`),
    create: (b: ProjectInput) =>
      req<Project>('/api/projects', { method: 'POST', body: JSON.stringify(b) }),
    update: (id: string, b: Partial<ProjectInput & { status: TaskStatus }>) =>
      req<Project>(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
    done: (id: string) => req<Project>(`/api/projects/${id}/done`, { method: 'POST' }),
    delete: (id: string) => req<{ deleted: string }>(`/api/projects/${id}`, { method: 'DELETE' }),
  },
  urge: (projectId: string) =>
    req<{ urge_count: number }>(`/api/follow-ups/${projectId}/urge`, { method: 'POST' }),
  updateFollowUp: (projectId: string, b: { person?: string; nextFollowDate?: string }) =>
    req(`/api/follow-ups/${projectId}`, { method: 'PATCH', body: JSON.stringify(b) }),
  listInbox: () => req<InboxItem[]>('/api/inbox'),
  createInbox: (content: string, tags = '') =>
    req<InboxItem>('/api/inbox', { method: 'POST', body: JSON.stringify({ content, tags }) }),
  updateInbox: (id: string, b: { content?: string; tags?: string }) =>
    req<InboxItem>(`/api/inbox/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  deleteInbox: (id: string) => req<{ deleted: string }>(`/api/inbox/${id}`, { method: 'DELETE' }),
  // projectId → 进已有项目为子任务；否则 main/side/follow 新建同名项目、idea 平铺
  convertInbox: (id: string, b: ConvertInput) =>
    req<Task | Project>(`/api/inbox/${id}/convert`, { method: 'POST', body: JSON.stringify(b) }),
  chat: (message: string) =>
    req<{ result: string }>('/api/llm/chat', { method: 'POST', body: JSON.stringify({ message }) }),
  getSettings: () => req<Record<string, string>>('/api/settings'),
  putSetting: (key: string, value: string) =>
    req<{ key: string; value: string }>(`/api/settings/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    }),
  listDocuments: (folderId?: string) =>
    req<Document[]>(`/api/documents${folderId ? `?folderId=${encodeURIComponent(folderId)}` : ''}`),
  searchDocuments: (q: string) =>
    req<DocumentSearchRow[]>(`/api/documents/search?q=${encodeURIComponent(q)}`),
  getDocument: (id: string) => req<Document>(`/api/documents/${id}`),
  createDocument: (b: DocumentInput) =>
    req<Document>('/api/documents', { method: 'POST', body: JSON.stringify(b) }),
  listDocFolders: () => req<DocFolder[]>('/api/doc-folders'),
  createDocFolder: (b: { name: string; parentId?: string | null }) =>
    req<DocFolder>('/api/doc-folders', { method: 'POST', body: JSON.stringify(b) }),
  updateDocFolder: (id: string, b: Partial<{ name: string; parentId: string | null; sortOrder: number }>) =>
    req<DocFolder>(`/api/doc-folders/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  deleteDocFolder: (id: string) => req<{ deleted: string }>(`/api/doc-folders/${id}`, { method: 'DELETE' }),
  folderContents: (id: string) => req<{ folders: DocFolder[]; docs: Document[] }>(`/api/doc-folders/${id}/contents`),
  previewAutoOrganize: (folderId?: string | null, onlyUnorganized?: boolean) =>
    req<{ suggestions: { name: string; docIds: string[] }[]; docs: { id: string; title: string; summary: string }[] }>(
      '/api/doc-folders/auto-organize/preview',
      { method: 'POST', body: JSON.stringify({ folderId, onlyUnorganized }) },
    ),
  applyAutoOrganize: (suggestions: { name: string; docIds: string[] }[]) =>
    req<{ applied: boolean }>('/api/doc-folders/auto-organize/apply', {
      method: 'POST',
      body: JSON.stringify({ suggestions }),
    }),
  updateDocument: (id: string, b: Partial<DocumentInput>) =>
    req<Document>(`/api/documents/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  deleteDocument: (id: string) => req<{ deleted: string }>(`/api/documents/${id}`, { method: 'DELETE' }),
  listClips: () => req<Clip[]>('/api/clips'),
  createClip: (b: { html: string; url?: string; title?: string; source?: 'extension' | 'clipboard' }) =>
    req<Clip>('/api/clips', { method: 'POST', body: JSON.stringify(b) }),
  getClip: (id: string) => req<Clip>(`/api/clips/${id}`),
  deleteClip: (id: string) => req<{ deleted: string }>(`/api/clips/${id}`, { method: 'DELETE' }),
  convertClip: (id: string, title?: string) =>
    req<Document>(`/api/clips/${id}/convert`, { method: 'POST', body: JSON.stringify({ title }) }),
  listNotifications: () => req<NotificationItem[]>('/api/notifications'),
  generateWeeklyReportDoc: () =>
    req<Document>('/api/llm/weekly-report', { method: 'POST' }),
  polishText: (text: string, instruction?: string) =>
    req<{ result: string }>('/api/llm/polish', { method: 'POST', body: JSON.stringify({ text, instruction }) }),
  checkNotifications: () =>
    req<NotificationItem[]>('/api/notifications/check', { method: 'POST' }),
  clearNotifications: () =>
    req<{ cleared: boolean }>('/api/notifications/clear', { method: 'POST' }),
  // 报告系统
  reportTasks: (range: 'today' | 'week' | 'month') => req<TaskRangeData>(`/api/reports/tasks/${range}`),
  listReports: (type?: string) => req<Report[]>(`/api/reports${type ? `?type=${type}` : ''}`),
  getReport: (id: string) => req<Report>(`/api/reports/${id}`),
  getReportByDate: (type: string, date: string) =>
    req<Report>(`/api/reports/by-date?type=${type}&date=${encodeURIComponent(date)}`),
  createReport: (b: { type: 'daily' | 'weekly' | 'monthly' | 'thinking'; date: string; title?: string; content?: string; content_markdown?: string }) =>
    req<Report>('/api/reports', { method: 'POST', body: JSON.stringify(b) }),
  updateReport: (id: string, b: { title?: string; content?: string; content_markdown?: string }) =>
    req<Report>(`/api/reports/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  // AI 生成报告（M35）：调本机 standup-agent（highagent）生成并导入；可能耗时 1-2 分钟
  generateStandupReport: (b: { type: 'daily' | 'weekly' | 'monthly'; date?: string }) =>
    req<Report>('/api/reports/standup', { method: 'POST', body: JSON.stringify(b) }),
  deleteReport: (id: string) => req<{ deleted: string }>(`/api/reports/${id}`, { method: 'DELETE' }),
  // 调研画布
  listCanvasBoards: () => req<CanvasBoard[]>('/api/canvas-boards'),
  createCanvasBoard: (title: string) =>
    req<CanvasBoard>('/api/canvas-boards', { method: 'POST', body: JSON.stringify({ title }) }),
  getCanvasBoard: (id: string) => req<CanvasBoardWithItems>(`/api/canvas-boards/${id}`),
  updateCanvasBoard: (id: string, title: string) =>
    req<CanvasBoard>(`/api/canvas-boards/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) }),
  deleteCanvasBoard: (id: string) =>
    req<{ deleted: string }>(`/api/canvas-boards/${id}`, { method: 'DELETE' }),
  createCanvasItem: (boardId: string, b: Partial<CanvasItem>) =>
    req<CanvasItem>(`/api/canvas-boards/${boardId}/items`, { method: 'POST', body: JSON.stringify(b) }),
  updateCanvasItem: (id: string, b: Partial<CanvasItem>) =>
    req<CanvasItem>(`/api/canvas-items/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  deleteCanvasItem: (id: string) =>
    req<{ deleted: string }>(`/api/canvas-items/${id}`, { method: 'DELETE' }),
  // Live2D 桌宠模型（M12）
  listLive2dModels: () => req<Live2dModelList>('/api/live2d/models'),
  openLive2dFolder: () =>
    req<{ ok: boolean; root: string }>('/api/live2d/open-folder', { method: 'POST' }),
  // 文档导出到本地 Markdown
  exportDocument: (id: string) =>
    req<{ path: string }>(`/api/documents/${id}/export`, { method: 'POST' }),
  // 用系统浏览器打开外部链接
  openExternal: (url: string) =>
    req<{ ok: boolean }>('/api/open-external', { method: 'POST', body: JSON.stringify({ url }) }),
  // 一键双端同步（M21）：提交本地 + 拉远端；远端有数据时后端自重启应用
  sync: () =>
    req<{ status: 'pushed' | 'uptodate' | 'restarting'; committed?: boolean; backup?: string | null }>(
      '/api/sync',
      { method: 'POST' },
    ),
  // 就选中内容提问（M16）
  askLlm: (text: string, question: string) =>
    req<{ result: string }>('/api/llm/ask', { method: 'POST', body: JSON.stringify({ text, question }) }),
  // AI 排版（M16）
  formatDoc: (content: string) =>
    req<{ result: string }>('/api/llm/format', { method: 'POST', body: JSON.stringify({ content }) }),
  // 错别字（M18）：流处理修正 / 批处理清单
  fixTypos: (text: string) =>
    req<{ result: string }>('/api/llm/typos', { method: 'POST', body: JSON.stringify({ text, mode: 'fix' }) }),
  checkTypos: (text: string) =>
    req<{ issues: TypoIssue[] }>('/api/llm/typos', { method: 'POST', body: JSON.stringify({ text, mode: 'check' }) }),
  // 知识库（M23）
  listKnowledge: (q?: { q?: string; type?: string; channel?: string; tag?: string; status?: string; includeExpired?: string; team?: string; project?: string }) =>
    req<KnowledgeItem[]>(`/api/knowledge${qsOf(q as Record<string, string | undefined>)}`),
  getKnowledge: (id: string) => req<KnowledgeItemDetail>(`/api/knowledge/${id}`),
  createKnowledge: (b: KnowledgeInput) =>
    req<KnowledgeItem>('/api/knowledge', { method: 'POST', body: JSON.stringify(b) }),
  updateKnowledge: (id: string, b: Partial<KnowledgeInput>) =>
    req<KnowledgeItem>(`/api/knowledge/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  concludeKnowledge: (id: string, conclusion: string, promoteTo?: 'note' | 'adr') =>
    req<{ concluded: KnowledgeItem; promoted: KnowledgeItem | null }>(`/api/knowledge/${id}/conclude`, {
      method: 'POST',
      body: JSON.stringify({ conclusion, promoteTo }),
    }),
  usefulKnowledge: (id: string) =>
    req<KnowledgeItem>(`/api/knowledge/${id}/useful`, { method: 'POST' }),
  deleteKnowledge: (id: string) =>
    req<{ deleted: string }>(`/api/knowledge/${id}`, { method: 'DELETE' }),

  // 个性化背景（M30 P1）
  uploadBackground: async (file: File): Promise<{ file: string }> => {
    const fd = new FormData();
    fd.append('file', file);
    const headers: Record<string, string> = {};
    const token = teamToken();
    if (token) headers['x-team-token'] = token;
    const res = await fetch(`${API}/api/assets/background`, { method: 'POST', headers, body: fd });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
    return res.json();
  },
  deleteBackground: () => req<{ deleted: string | null }>('/api/assets/background', { method: 'DELETE' }),

  // 团队空间（M24）
  listTeams: () => req<Team[]>('/api/teams'),
  createTeam: (b: { name: string; description?: string }) =>
    req<{ id: string; name: string; my_role: TeamRole }>('/api/teams', { method: 'POST', body: JSON.stringify(b) }),
  joinTeam: (invite_token: string) =>
    req<{ id: string; name: string; my_role: TeamRole }>('/api/teams/join', { method: 'POST', body: JSON.stringify({ invite_token }) }),
  getTeam: (id: string) => req<TeamDetail>(`/api/teams/${id}`),
  updateTeam: (id: string, b: { name?: string; description?: string }) =>
    req<{ id: string; name: string; description: string }>(`/api/teams/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  addTeamMember: (id: string, user_name: string, role?: TeamRole) =>
    req(`/api/teams/${id}/members`, { method: 'POST', body: JSON.stringify({ user_name, role }) }),
  updateTeamMember: (id: string, user: string, role: TeamRole) =>
    req(`/api/teams/${id}/members/${encodeURIComponent(user)}`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  removeTeamMember: (id: string, user: string) =>
    req(`/api/teams/${id}/members/${encodeURIComponent(user)}`, { method: 'DELETE' }),
  rotateTeamInvite: (id: string) =>
    req<{ invite_token: string }>(`/api/teams/${id}/rotate-invite`, { method: 'POST' }),
  deleteTeam: (id: string) => req<{ deleted: string }>(`/api/teams/${id}`, { method: 'DELETE' }),

  // 工作库项目（M25 / K2）
  listKbProjects: (team: string) => req<KbProject[]>(`/api/kb-projects?team=${encodeURIComponent(team)}`),
  createKbProject: (b: { name: string; team_id: string; parent_id?: string | null; description?: string; owners?: string[] }) =>
    req<KbProject>('/api/kb-projects', { method: 'POST', body: JSON.stringify(b) }),
  updateKbProject: (id: string, b: Partial<{ name: string; description: string; parent_id: string | null; owners: string[]; status: string }>) =>
    req<KbProject>(`/api/kb-projects/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  deleteKbProject: (id: string) => req<{ deleted: string }>(`/api/kb-projects/${id}`, { method: 'DELETE' }),

  // 评论（M26 / K3）
  listComments: (itemId: string) => req<KbComment[]>(`/api/knowledge/${itemId}/comments`),
  createComment: (itemId: string, b: { content: string; parent_id?: string }) =>
    req<KbComment>(`/api/knowledge/${itemId}/comments`, { method: 'POST', body: JSON.stringify(b) }),
  deleteComment: (id: string) => req<{ deleted: string }>(`/api/comments/${id}`, { method: 'DELETE' }),

  // OKF 导出（M26）
  exportOkf: (team: string) =>
    req<{ dir: string; count: number }>('/api/knowledge/export/okf', { method: 'POST', body: JSON.stringify({ team }) }),

  // 发布/同步（M27 / K4）
  publishKnowledge: (id: string, to_team: string) =>
    req<Publication>(`/api/knowledge/${id}/publish`, { method: 'POST', body: JSON.stringify({ to_team }) }),
  listPublications: (team: string) => req<Publication[]>(`/api/publications?team=${encodeURIComponent(team)}`),
  publicationCount: (team: string) => req<{ c: number }>(`/api/publications/count?team=${encodeURIComponent(team)}`),
  viewPublication: (id: string) => req<KnowledgeItemDetail>(`/api/publications/${id}/item`),
  ignorePublication: (id: string) => req<Publication>(`/api/publications/${id}/ignore`, { method: 'POST' }),
  syncPublication: (id: string) =>
    req<{ publication: Publication; item: { id: string; title: string } }>(`/api/publications/${id}/sync`, { method: 'POST' }),
  pullKnowledge: (id: string) =>
    req<{ id: string; title: string; upstream_updated_at: string }>(`/api/knowledge/${id}/pull`, { method: 'POST' }),
  // AI 助手会话（M19）
  listConversations: () => req<Conversation[]>('/api/conversations'),
  createConversation: () => req<Conversation>('/api/conversations', { method: 'POST' }),
  getConversation: (id: string) => req<ConversationDetail>(`/api/conversations/${id}`),
  deleteConversation: (id: string) =>
    req<{ deleted: string }>(`/api/conversations/${id}`, { method: 'DELETE' }),
  sendChatMessage: (convId: string, content: string, opts?: { planMode?: boolean; executePlan?: string; planMsgId?: string }) =>
    req<{ id: string; content: string; applied: AgentActionItem[]; clientActions?: ClientAction[] }>(`/api/conversations/${convId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, ...opts }),
    }),
  undoAgentAction: (id: string) =>
    req<{ undone: string }>(`/api/agent-actions/${id}/undo`, { method: 'POST' }),
  cancelPlan: (convId: string, msgId: string) =>
    req<{ cancelled: string }>(`/api/conversations/${convId}/messages/${msgId}/cancel-plan`, { method: 'POST' }),
  // A4 轨迹回放
  getAgentRun: (messageId: string) =>
    req<AgentRun>(`/api/agent-runs/by-message/${messageId}`),
  // 导入本地文件为文档（md/txt/docx/pdf）
  importDocument: async (file: File): Promise<Document> => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${API}/api/documents/import`, { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    return data;
  },
};

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  last_message?: string | null;
}

/** agent 动作卡片项（A2；老消息是 string 兼容；A3 起带 clientAction，A4 plan 卡片 tool='plan'） */
export type AgentActionItem =
  | string
  | {
      id: string;
      tool: string;
      text: string;
      undoable: boolean;
      planStatus?: 'pending' | 'executed' | 'cancelled';
      clientAction?: ClientAction;
    };

/** 前端联动动作（A3 client_actions） */
export interface ClientAction {
  type: 'open_doc' | 'nav';
  docId?: string;
  title?: string;
  page?: string;
}

/** A4 轨迹回放：轮次级轨迹 */
export interface AgentRun {
  id: string;
  user_msg: string;
  plan_mode: number;
  rounds: { thought: string | null; calls: { tool: string; params: Record<string, unknown>; result: string }[] }[];
  reply: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  actions: AgentActionItem[];
  created_at: string;
}

export interface ConversationDetail extends Conversation {
  messages: ChatMessage[];
}

export interface TypoIssue {
  before: string;
  after: string;
  context: string;
}

/** 知识库条目类型（M23） */
export type KnowledgeType = 'intel' | 'share' | 'note' | 'rfc' | 'guide' | 'spec' | 'adr';

export const KNOWLEDGE_TYPE_LABEL: Record<KnowledgeType, { label: string; icon: string; color: string }> = {
  intel: { label: '快讯', icon: '⚡', color: '#f59e0b' },
  share: { label: '分享', icon: '🔗', color: '#0ea5e9' },
  note: { label: '经验', icon: '📝', color: '#059669' },
  rfc: { label: '探讨', icon: '💬', color: '#8b5cf6' },
  guide: { label: '规范', icon: '📖', color: '#2563eb' },
  spec: { label: '契约', icon: '📐', color: '#0891b2' },
  adr: { label: '决策', icon: '⚖️', color: '#be123c' },
};

export interface KnowledgeItem {
  id: string;
  type: KnowledgeType;
  title: string;
  team_id: string;
  project_id: string | null;
  author: string;
  owners: string;
  channels: string;
  tags: string;
  ttl: string;
  status: string;
  acl: string;
  notify: string;
  related: string;
  conclusion: string;
  useful_count: number;
  source_url: string;
  source_clip_id: string | null;
  source_doc_id: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  upstream_id: string | null;
  upstream_team: string;
  upstream_updated_at: string | null;
  upstream_has_update: number | null;
}

/** 发布记录（M27 / K4） */
export interface Publication {
  id: string;
  item_id: string;
  from_team: string;
  to_team: string;
  from_author: string;
  source_updated_at: string;
  status: 'pending' | 'viewed' | 'synced' | 'ignored';
  synced_item_id: string | null;
  resolved_by: string;
  published_at: string;
  resolved_at: string | null;
  item_title?: string;
  item_type?: string;
  from_team_name?: string;
}

export interface KnowledgeItemDetail extends KnowledgeItem {
  content: string;
}

export interface KnowledgeInput {
  type: KnowledgeType;
  title: string;
  content?: string;
  team_id?: string;
  project_id?: string | null;
  author?: string;
  owners?: string[];
  channels?: string[];
  tags?: string[];
  ttl?: string;
  status?: string;
  acl?: string;
  notify?: string;
  related?: string[];
  conclusion?: string;
  source_url?: string;
  source_clip_id?: string;
  source_doc_id?: string;
}

export const KNOWLEDGE_CHANNELS = ['backend', 'frontend', 'infra', 'product', 'ai-intel', 'learning', 'general'];

/** 团队空间（M24） */
export type TeamRole = 'owner' | 'admin' | 'member';

export interface Team {
  id: string;
  name: string;
  description: string;
  created_by: string;
  created_at: string;
  member_count: number;
  item_count: number;
  my_role: TeamRole;
}

export interface TeamMember {
  user_name: string;
  role: TeamRole;
  joined_at: string;
}

export interface TeamDetail extends Team {
  invite_token?: string;
  members: TeamMember[];
}

/** 条目评论（M26 / K3） */
export interface KbComment {
  id: string;
  item_id: string;
  parent_id: string | null;
  author: string;
  content: string;
  created_at: string;
}

/** 工作库项目（M25 / K2） */
export interface KbProject {
  id: string;
  team_id: string;
  name: string;
  description: string;
  parent_id: string | null;
  owners: string; // JSON 数组
  status: string;
  sort_order: number;
  item_count: number;
  created_at: string;
  updated_at: string;
}

/** 打开外部链接：Tauri 走 server（explorer），纯浏览器用 window.open */
export async function openExternalLink(url: string): Promise<void> {
  if ('__TAURI_INTERNALS__' in window) {
    try {
      await api.openExternal(url);
      return;
    } catch { /* 回落 window.open */ }
  }
  window.open(url, '_blank', 'noopener');
}

export interface Live2dModelInfo {
  name: string;
  url: string;
  format: 'cubism4' | 'cubism2';
}

export interface Live2dModelList {
  models: Live2dModelInfo[];
  root: string;
}

export const TYPE_LABEL: Record<TaskType, string> = {
  main: '主线',
  side: '支线',
  follow: '跟进',
  idea: '想法',
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: '待办',
  doing: '进行中',
  done: '已完成',
  archived: '已归档',
};
