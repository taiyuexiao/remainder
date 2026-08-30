const API = import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:3210';

/** API base（拼剪藏图片等相对路径用） */
export const API_BASE = API;

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

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
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
  previewAutoOrganize: (folderId?: string, onlyUnorganized?: boolean) =>
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
  generateWeeklyReport: () =>
    req<Document>('/api/llm/weekly-report', { method: 'POST' }),
  polishText: (text: string, instruction?: string) =>
    req<{ result: string }>('/api/llm/polish', { method: 'POST', body: JSON.stringify({ text, instruction }) }),
  checkNotifications: () =>
    req<NotificationItem[]>('/api/notifications/check', { method: 'POST' }),
  clearNotifications: () =>
    req<{ cleared: boolean }>('/api/notifications/clear', { method: 'POST' }),
};

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
