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
import { api, API_BASE, type Document, type DocumentInput } from '../api/client';

const emptyDocContent = JSON.stringify({
  type: 'doc',
  content: [{ type: 'paragraph' }],
});

function parseContent(content: string | undefined): object | string {
  if (!content) return JSON.parse(emptyDocContent);
  try {
    return JSON.parse(content);
  } catch {
    // 剪藏转入的文档是 HTML：Tiptap 可直接解析 HTML 字符串
    // 兜底：旧转换文档的图片是相对路径，补成绝对路径（webview 源是 tauri.localhost 会 404）
    return content.replaceAll('src="/api/', `src="${API_BASE}/api/`);
  }
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 来源链接域名（无来源返回空） */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export default function DocsPage() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Document[] | null>(null); // null = 未搜索，显示全部
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    try {
      const list = await api.listDocuments();
      setDocs(list);
      setError('');
    } catch (e) {
      setError(`后端连接失败：${(e as Error).message}`);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // 搜索框防抖 300ms（M11.4）；清空恢复全部列表
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = query.trim();
    if (!q) {
      setResults(null);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      try {
        // 搜索结果是轻行（无 content），选中时会从 docs 补全；不在 docs 里则直接展示
        setResults((await api.searchDocuments(q)) as Document[]);
      } catch {
        setResults([]);
      }
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [query]);

  // 生成本周周报（M8.3）：LLM 生成 → 落 documents → 自动打开
  const weeklyReport = async () => {
    setWeeklyLoading(true);
    try {
      const doc = await api.generateWeeklyReport();
      await reload();
      setSelectedId(doc.id);
    } catch (e) {
      alert(`${(e as Error).message}`);
    } finally {
      setWeeklyLoading(false);
    }
  };

  const shown = results ?? docs;

  const selected = useMemo(
    () => docs.find((d) => d.id === selectedId) ?? null,
    [docs, selectedId],
  );

  // 搜索结果可能是轻行（无 content）；选中时优先用完整行，不在缓存则拉单篇
  const selectDoc = async (id: string) => {
    if (!docs.some((d) => d.id === id)) {
      try {
        const full = await api.getDocument(id);
        setDocs((prev) => [full, ...prev]);
      } catch {
        /* 忽略 */
      }
    }
    setSelectedId(id);
  };

  const createDoc = async () => {
    try {
      const doc = await api.createDocument({ title: '未命名文档' });
      await reload();
      setSelectedId(doc.id);
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const deleteDoc = async (id: string) => {
    if (!confirm('确认删除该文档？')) return;
    try {
      await api.deleteDocument(id);
      if (selectedId === id) setSelectedId(null);
      await reload();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <div className="h-full flex">
      {/* 左侧文档列表 */}
      <aside className="w-60 shrink-0 bg-white border-r border-slate-200 flex flex-col">
        <header className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold text-sm">文档</h2>
          <div className="flex items-center gap-1.5">
            <button
              onClick={weeklyReport}
              disabled={weeklyLoading}
              title="聚合本周项目/子任务/跟进数据，LLM 生成周报文档"
              className="text-xs rounded-md bg-emerald-50 text-emerald-700 px-2 py-1.5 hover:bg-emerald-100 disabled:opacity-40"
            >
              {weeklyLoading ? '生成中…' : '📊 周报'}
            </button>
            <button
              onClick={createDoc}
              className="text-xs rounded-md bg-indigo-600 text-white px-2.5 py-1.5 hover:bg-indigo-700"
            >
              新建
            </button>
          </div>
        </header>
        <div className="px-3 py-2 border-b border-slate-100">
          <input
            className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
            placeholder="搜索文档（标题/正文/标签）…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {error && <div className="px-4 py-2 text-xs text-red-500 bg-red-50">{error}</div>}
        <div className="flex-1 overflow-y-auto py-2">
          {shown.map((d) => (
            <div
              key={d.id}
              onClick={() => selectDoc(d.id)}
              className={`group mx-2 mb-1 rounded-lg px-3 py-2 cursor-pointer flex items-start gap-2 transition-colors ${
                selectedId === d.id
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span className="text-sm mt-0.5">{d.clip_id ? '📥' : '📝'}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm truncate ${selectedId === d.id ? 'font-medium' : ''}`}>{d.title || '未命名'}</p>
                {d.summary && <p className="text-[10px] text-slate-400 truncate mt-0.5">{d.summary}</p>}
                <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                  <span>{formatTime(d.updated_at)}</span>
                  {d.tags && <span className="text-slate-300 truncate">{d.tags}</span>}
                  {d.source_url && hostOf(d.source_url) && (
                    <a
                      href={d.source_url}
                      target="_blank"
                      rel="noopener"
                      onClick={(e) => e.stopPropagation()}
                      className="text-indigo-400 hover:underline truncate"
                    >
                      {hostOf(d.source_url)}
                    </a>
                  )}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteDoc(d.id);
                }}
                className="opacity-0 group-hover:opacity-100 text-xs text-slate-400 hover:text-red-500 px-1"
                title="删除"
              >
                🗑
              </button>
            </div>
          ))}
          {!shown.length && !error && (
            <p className="text-xs text-slate-400 text-center pt-10">
              {results ? '没有匹配的文档' : '暂无文档，点击右上角新建'}
            </p>
          )}
        </div>
      </aside>

      {/* 主编辑区 */}
      <main className="flex-1 min-w-0 bg-white flex flex-col">
        {selected ? (
          <DocEditor key={selected.id} doc={selected} onChange={reload} saving={saving} setSaving={setSaving} />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-300">
            <div className="text-5xl mb-4">📝</div>
            <p className="text-sm">选择或新建文档开始编辑</p>
          </div>
        )}
      </main>
    </div>
  );
}

function DocEditor({
  doc,
  onChange,
  saving,
  setSaving,
}: {
  doc: Document;
  onChange: () => void;
  saving: boolean;
  setSaving: (v: boolean) => void;
}) {
  const [title, setTitle] = useState(doc.title);
  const [tags, setTags] = useState(doc.tags ?? '');
  const [lastSaved, setLastSaved] = useState(doc.updated_at);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    content: parseContent(doc.content),
    editorProps: {
      attributes: {
        class: 'focus:outline-none min-h-[20rem] px-8 py-6',
      },
      // 粘贴图片文件 → 转 base64 data URL 内联（不做文件服务器）
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
    async (patch: Partial<DocumentInput>) => {
      if (patch.title === undefined && patch.content === undefined && patch.tags === undefined) return;
      try {
        setSaving(true);
        const updated = await api.updateDocument(doc.id, patch);
        setLastSaved(updated.updated_at);
        onChange();
      } catch (e) {
        alert((e as Error).message);
      } finally {
        setSaving(false);
      }
    },
    [doc.id, onChange, setSaving],
  );

  const scheduleSave = useCallback(
    (patch: Partial<DocumentInput>) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => save(patch), 1000);
    },
    [save],
  );

  useEffect(() => {
    if (!editor) return;
    const handler = () => {
      const json = editor.getJSON();
      scheduleSave({ content: JSON.stringify(json) });
    };
    editor.on('update', handler);
    return () => {
      editor.off('update', handler);
    };
  }, [editor, scheduleSave]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <>
      <Toolbar editor={editor} />
      <div className="flex-1 overflow-y-auto">
        <input
          className="w-full px-8 pt-8 pb-2 text-2xl font-bold text-slate-800 placeholder:text-slate-300 border-b border-transparent focus:border-slate-100 focus:outline-none bg-transparent"
          placeholder="文档标题"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            scheduleSave({ title: e.target.value });
          }}
        />
        <div className="px-8 py-1.5 border-b border-slate-50 flex items-center gap-2">
          <span className="text-[11px] text-slate-300 shrink-0">标签</span>
          <input
            className="flex-1 text-xs text-slate-500 placeholder:text-slate-300 focus:outline-none bg-transparent"
            placeholder="逗号分隔，回车或失焦保存"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            onBlur={() => tags !== (doc.tags ?? '') && save({ tags })}
            onKeyDown={(e) => e.key === 'Enter' && save({ tags })}
          />
          {doc.source_url && hostOf(doc.source_url) && (
            <a
              href={doc.source_url}
              target="_blank"
              rel="noopener"
              className="text-[11px] text-indigo-400 hover:underline shrink-0"
            >
              来源：{hostOf(doc.source_url)}
            </a>
          )}
        </div>
        <EditorContent editor={editor} />
      </div>
      <div className="px-4 py-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
        <span>最后保存：{formatTime(lastSaved)}</span>
        <span>{saving ? '保存中…' : '已自动保存'}</span>
      </div>
    </>
  );
}

function Toolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  const [polishing, setPolishing] = useState(false);
  if (!editor) return null;

  const { from, to, empty } = editor.state.selection;

  // ✨ 润色选中文本（M8.3）：无选中禁用；LLM 未配置时后端返回明确错误，alert 提示
  const polish = async () => {
    if (empty || polishing) return;
    const text = editor.state.doc.textBetween(from, to, ' ');
    if (!text.trim()) return;
    setPolishing(true);
    try {
      const { result } = await api.polishText(text);
      editor.chain().focus().insertContentAt({ from, to }, result).run();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setPolishing(false);
    }
  };

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
      {editor.isActive('table') && (
        <>
          <Btn onClick={() => editor.chain().focus().addRowAfter().run()} title="下方插入行">
            行+
          </Btn>
          <Btn onClick={() => editor.chain().focus().addColumnAfter().run()} title="右侧插入列">
            列+
          </Btn>
        </>
      )}
      <Btn onClick={insertImage} title="插入图片（URL，或直接粘贴截图）">
        图片
      </Btn>
      <span className="w-px h-4 bg-slate-200 mx-1" />
      <button
        type="button"
        onClick={polish}
        disabled={empty || polishing}
        title={empty ? '先在文中选中一段文字' : 'AI 润色选中文本'}
        className={`px-2 py-1 rounded text-sm transition-colors ${
          empty || polishing
            ? 'text-slate-300 cursor-not-allowed'
            : 'text-violet-600 hover:bg-violet-50'
        }`}
      >
        {polishing ? '润色中…' : '✨ 润色'}
      </button>
    </div>
  );
}
