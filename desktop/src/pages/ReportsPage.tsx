import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { api, type Report, type TaskRangeData } from '../api/client';

const TYPE_LABEL: Record<string, string> = {
  daily: '日报',
  weekly: '周报',
  monthly: '月报',
};

const RANGE_TO_TYPE: Record<string, 'daily' | 'weekly' | 'monthly'> = {
  today: 'daily',
  week: 'weekly',
  month: 'monthly',
};

const emptyDocContent = JSON.stringify({
  type: 'doc',
  content: [{ type: 'paragraph' }],
});

function parseContent(content: string | undefined): object {
  if (!content) return JSON.parse(emptyDocContent);
  try {
    return JSON.parse(content);
  } catch {
    return JSON.parse(emptyDocContent);
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ReportsPage() {
  const [activeType, setActiveType] = useState<'daily' | 'weekly' | 'monthly' | null>(null);
  const [tasks, setTasks] = useState<Record<string, TaskRangeData>>({});

  useEffect(() => {
    const load = async () => {
      try {
        const [today, week, month] = await Promise.all([
          api.reportTasks('today'),
          api.reportTasks('week'),
          api.reportTasks('month'),
        ]);
        setTasks({ today, week, month });
      } catch {
        /* 后端未启动时静默 */
      }
    };
    load();
  }, []);

  if (activeType) {
    return (
      <ReportTypePage
        type={activeType}
        onBack={() => setActiveType(null)}
      />
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <header className="px-6 py-4 bg-white border-b border-slate-200">
        <h2 className="font-semibold">报告</h2>
        <p className="text-xs text-slate-400 mt-0.5">选择类型进入编辑</p>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="grid grid-cols-3 gap-4">
          {(['today', 'week', 'month'] as const).map((r) => {
            const t = tasks[r];
            const type = RANGE_TO_TYPE[r];
            return (
              <button
                key={r}
                onClick={() => setActiveType(type)}
                className="rounded-xl bg-white border border-slate-200 p-6 text-left hover:shadow-md transition-shadow"
              >
                <div className="text-3xl mb-3">
                  {type === 'daily' ? '📅' : type === 'weekly' ? '📊' : '📈'}
                </div>
                <div className="font-semibold text-slate-800">{TYPE_LABEL[type]}</div>
                <div className="text-xs text-slate-400 mt-1">
                  {r === 'today' ? '本日任务' : r === 'week' ? '本周任务' : '本月任务'}
                </div>
                <div className="mt-3 text-sm text-slate-600">
                  {t ? (
                    <>
                      {r === 'today' ? (
                        <>待办 {t.today?.filter((x) => x.status !== 'done').length ?? 0} · 逾期 {t.overdue?.length ?? 0}</>
                      ) : (
                        <>进行中 {t.doingProjects?.length ?? 0} · 逾期 {t.overdueTasks?.length ?? 0}</>
                      )}
                    </>
                  ) : (
                    '加载中…'
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ReportTypePage({ type, onBack }: { type: 'daily' | 'weekly' | 'monthly'; onBack: () => void }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadReports = useCallback(async () => {
    try {
      setReports(await api.listReports(type));
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const openToday = async () => {
    const date = getCurrentDateForType(type);
    try {
      const report = await api.createReport({ type, date });
      await loadReports();
      setSelectedId(report.id);
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const deleteReport = async (id: string) => {
    if (!confirm('确认删除该报告？')) return;
    try {
      await api.deleteReport(id);
      if (selectedId === id) setSelectedId(null);
      await loadReports();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <div className="h-full flex bg-slate-50">
      {/* 左侧历史列表 */}
      <aside className="w-56 shrink-0 bg-white border-r border-slate-200 flex flex-col">
        <header className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <button onClick={onBack} className="text-xs text-slate-500 hover:text-indigo-600 flex items-center gap-1">
            ← 返回
          </button>
          <button
            onClick={openToday}
            className="text-xs rounded-md bg-indigo-600 text-white px-2.5 py-1.5 hover:bg-indigo-700"
          >
            新建
          </button>
        </header>
        <div className="px-3 py-2 border-b border-slate-100">
          <h3 className="font-medium text-sm">{TYPE_LABEL[type]}</h3>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {loading ? (
            <p className="text-xs text-slate-400 text-center pt-10">加载中…</p>
          ) : reports.length === 0 ? (
            <p className="text-xs text-slate-400 text-center pt-10">暂无记录，点击右上角新建</p>
          ) : (
            reports.map((r) => (
              <div
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                className={`mx-2 mb-1 rounded-lg px-3 py-2 cursor-pointer flex items-center justify-between ${
                  selectedId === r.id
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm truncate">{r.title}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{r.date}</p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteReport(r.id);
                  }}
                  className="text-xs text-slate-400 hover:text-red-500"
                >
                  🗑
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* 右侧编辑器 */}
      <main className="flex-1 min-w-0 bg-white flex flex-col">
        {selectedId ? (
          <ReportEditor reportId={selectedId} onChange={loadReports} />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-300">
            <div className="text-5xl mb-4">📝</div>
            <p className="text-sm">选择或新建{TYPE_LABEL[type]}开始编辑</p>
          </div>
        )}
      </main>
    </div>
  );
}

function getCurrentDateForType(type: 'daily' | 'weekly' | 'monthly'): string {
  const now = new Date();
  if (type === 'daily') return now.toISOString().slice(0, 10);
  if (type === 'monthly') return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const dow = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - dow);
  return monday.toISOString().slice(0, 10);
}

function ReportEditor({ reportId, onChange }: { reportId: string; onChange: () => void }) {
  const [report, setReport] = useState<Report | null>(null);
  const [title, setTitle] = useState('');
  const [lastSaved, setLastSaved] = useState('');
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    api
      .getReport(reportId)
      .then((r) => {
        if (active) {
          setReport(r);
          setTitle(r.title);
          setLastSaved(r.updated_at);
        }
      })
      .catch((e) => alert((e as Error).message));
    return () => {
      active = false;
    };
  }, [reportId]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Image,
      Placeholder.configure({ placeholder: '输入内容…' }),
    ],
    content: report ? parseContent(report.content) : JSON.parse(emptyDocContent),
    editorProps: {
      attributes: {
        class: 'focus:outline-none min-h-[20rem] px-8 py-6',
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (!file) continue;
            const reader = new FileReader();
            reader.onload = () => {
              editor?.chain().focus().setImage({ src: reader.result as string }).run();
            };
            reader.readAsDataURL(file);
            return true;
          }
        }
        return false;
      },
    },
  });

  const save = useCallback(
    async (patch: { title?: string; content?: string }) => {
      if (!report) return;
      try {
        setSaving(true);
        const updated = await api.updateReport(report.id, patch);
        setLastSaved(updated.updated_at);
        onChange();
      } catch (e) {
        alert((e as Error).message);
      } finally {
        setSaving(false);
      }
    },
    [report, onChange],
  );

  const scheduleSave = useCallback(
    (patch: { title?: string; content?: string }) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => save(patch), 1000);
    },
    [save],
  );

  const saveNow = useCallback(() => {
    const json = editor?.getJSON();
    save({ title, content: json ? JSON.stringify(json) : undefined });
  }, [editor, save, title]);

  useEffect(() => {
    if (!editor || !report) return;
    const handler = () => {
      const json = editor.getJSON();
      scheduleSave({ content: JSON.stringify(json) });
    };
    editor.on('update', handler);
    return () => {
      editor.off('update', handler);
    };
  }, [editor, report, scheduleSave]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  if (!report) return <div className="h-full flex items-center justify-center text-slate-400 text-sm">加载中…</div>;

  return (
    <>
      <Toolbar editor={editor} />
      <div className="flex-1 overflow-y-auto">
        <input
          className="w-full px-8 pt-8 pb-2 text-2xl font-bold text-slate-800 placeholder:text-slate-300 border-b border-transparent focus:border-slate-100 focus:outline-none bg-transparent"
          placeholder="报告标题"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            scheduleSave({ title: e.target.value });
          }}
        />
        <div className="px-8 py-1.5 border-b border-slate-50 flex items-center gap-2 text-xs text-slate-400">
          <span>{TYPE_LABEL[report.type]}</span>
          <span>·</span>
          <span>{report.date}</span>
        </div>
        <EditorContent editor={editor} />
      </div>
      <div className="px-4 py-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
        <span>最后保存：{formatDate(lastSaved)}</span>
        <div className="flex items-center gap-2">
          <span>{saving ? '保存中…' : '已自动保存'}</span>
          <button
            onClick={saveNow}
            className="rounded-md bg-indigo-600 text-white px-3 py-1.5 text-xs hover:bg-indigo-700"
          >
            保存
          </button>
        </div>
      </div>
    </>
  );
}

function Toolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;

  const insertImage = () => {
    const url = window.prompt('请输入图片 URL');
    if (url) editor.chain().focus().setImage({ src: url }).run();
  };

  const insertTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  const Btn = ({
    onClick,
    active,
    children,
    title,
  }: {
    onClick: () => void;
    active?: boolean;
    children: React.ReactNode;
    title?: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`px-2 py-1 rounded text-sm transition-colors ${
        active ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  );

  return (
    <div className="sticky top-0 z-10 px-4 py-2 border-b border-slate-200 bg-white/95 backdrop-blur flex flex-wrap items-center gap-1">
      <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="标题 1">
        H1
      </Btn>
      <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="标题 2">
        H2
      </Btn>
      <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="标题 3">
        H3
      </Btn>
      <span className="w-px h-4 bg-slate-200 mx-1" />
      <Btn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="加粗">
        <b>B</b>
      </Btn>
      <Btn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="斜体">
        <i>I</i>
      </Btn>
      <span className="w-px h-4 bg-slate-200 mx-1" />
      <Btn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="无序列表">
        • 列表
      </Btn>
      <Btn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="有序列表">
        1. 列表
      </Btn>
      <Btn onClick={() => editor.chain().focus().toggleTaskList().run()} active={editor.isActive('taskList')} title="任务列表">
        ☑ 任务
      </Btn>
      <span className="w-px h-4 bg-slate-200 mx-1" />
      <Btn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="引用">
        引用
      </Btn>
      <Btn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title="代码块">
        代码
      </Btn>
      <Btn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="分割线">
        —
      </Btn>
      <Btn onClick={insertTable} title="插入 3x3 表格">
        表格
      </Btn>
      <Btn onClick={insertImage} title="插入图片（URL，或直接粘贴截图）">
        图片
      </Btn>
    </div>
  );
}
