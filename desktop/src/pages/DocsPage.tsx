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
import { api, API_BASE, type Document, type DocumentInput, type DocFolder } from '../api/client';

const emptyDocContent = JSON.stringify({
  type: 'doc',
  content: [{ type: 'paragraph' }],
});

function parseContent(content: string | undefined): object | string {
  if (!content) return JSON.parse(emptyDocContent);
  try {
    return JSON.parse(content);
  } catch {
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

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function folderPath(folders: DocFolder[], id: string): DocFolder[] {
  const map = new Map(folders.map((f) => [f.id, f]));
  const path: DocFolder[] = [];
  let cur = map.get(id);
  while (cur) {
    path.unshift(cur);
    cur = cur.parent_id ? map.get(cur.parent_id) : undefined;
  }
  return path;
}

export default function DocsPage() {
  const [folders, setFolders] = useState<DocFolder[]>([]);
  const [rootDocs, setRootDocs] = useState<Document[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [creating, setCreating] = useState<{ type: 'folder' | 'doc'; parentId: string | null } | null>(null);
  const [error, setError] = useState('');
  const [organizeOpen, setOrganizeOpen] = useState(false);

  const loadFolders = useCallback(async () => {
    try {
      const list = await api.listDocFolders();
      setFolders(list);
      setError('');
    } catch (e) {
      setError(`加载文件夹失败：${(e as Error).message}`);
    }
  }, []);

  const loadRootDocs = useCallback(async () => {
    try {
      const list = await api.listDocuments('root');
      setRootDocs(list);
    } catch (e) {
      setError(`加载文档失败：${(e as Error).message}`);
    }
  }, []);

  useEffect(() => {
    loadFolders();
    loadRootDocs();
  }, [loadFolders, loadRootDocs]);

  const refresh = useCallback(async () => {
    await loadFolders();
    await loadRootDocs();
  }, [loadFolders, loadRootDocs]);

  const selectFolder = (id: string) => {
    setSelectedFolderId(id);
    setSelectedDocId(null);
    setCreating(null);
  };

  const selectDoc = (id: string) => {
    setSelectedDocId(id);
    setSelectedFolderId(null);
    setCreating(null);
  };

  const selectRoot = () => {
    setSelectedFolderId(null);
    setSelectedDocId(null);
    setCreating(null);
  };

  const startCreate = (type: 'folder' | 'doc') => {
    setCreating({ type, parentId: selectedFolderId });
  };

  const cancelCreate = () => setCreating(null);

  const finishCreate = async (name: string) => {
    if (!creating) return;
    const { type, parentId } = creating;
    setCreating(null);
    try {
      if (type === 'folder') {
        await api.createDocFolder({ name: name.trim() || '新建文件夹', parentId });
        await refresh();
      } else {
        const doc = await api.createDocument({ title: name.trim() || '未命名文档', folderId: parentId });
        await refresh();
        setSelectedDocId(doc.id);
        setSelectedFolderId(null);
      }
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <div className="h-full flex">
      {/* 主栏目：文件树 */}
      <aside className="w-64 shrink-0 bg-white border-r border-slate-200 flex flex-col">
        <header className="px-3 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold text-sm">文档</h2>
          <NewDropdown onCreate={startCreate} />
        </header>
        {error && <div className="px-3 py-2 text-xs text-red-500 bg-red-50">{error}</div>}
        <div className="flex-1 overflow-y-auto py-2">
          <FolderTreeRoot
            folders={folders}
            docs={rootDocs}
            selectedFolderId={selectedFolderId}
            selectedDocId={selectedDocId}
            creating={creating}
            onSelectFolder={selectFolder}
            onSelectDoc={selectDoc}
            onRefresh={refresh}
            onCancelCreate={cancelCreate}
            onFinishCreate={finishCreate}
          />
        </div>
      </aside>

      {/* 副栏目：内容区 / 编辑器 */}
      <main className="flex-1 min-w-0 bg-white flex flex-col">
        {selectedDocId ? (
          <DocEditorShell
            docId={selectedDocId}
            folders={folders}
            onBack={() => setSelectedDocId(null)}
            onChange={refresh}
          />
        ) : selectedFolderId ? (
          <FolderDetails
            folders={folders}
            folderId={selectedFolderId}
            onEnterFolder={selectFolder}
            onSelectDoc={selectDoc}
            onOrganize={() => setOrganizeOpen(true)}
            onRefresh={refresh}
          />
        ) : (
          <RootDetails
            folders={folders}
            docs={rootDocs}
            onSelectFolder={selectFolder}
            onSelectDoc={selectDoc}
            onOrganize={() => setOrganizeOpen(true)}
            onRefresh={refresh}
          />
        )}
      </main>

      {organizeOpen && (
        <OrganizeModal
          folderId={selectedFolderId}
          onClose={() => setOrganizeOpen(false)}
          onApplied={refresh}
        />
      )}
    </div>
  );
}

function NewDropdown({ onCreate }: { onCreate: (type: 'folder' | 'doc') => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="text-xs rounded-md bg-indigo-600 text-white px-2.5 py-1.5 hover:bg-indigo-700"
      >
        +
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-28 rounded-lg bg-white shadow-lg border border-slate-200 py-1 z-20 text-xs">
          <button
            onClick={() => {
              setOpen(false);
              onCreate('folder');
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2"
          >
            <span>📁</span> 文件夹
          </button>
          <button
            onClick={() => {
              setOpen(false);
              onCreate('doc');
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2"
          >
            <span>📝</span> 文档
          </button>
        </div>
      )}
    </div>
  );
}

// 根级文件树（文件夹 + 文档混排）
function FolderTreeRoot({
  folders,
  docs,
  selectedFolderId,
  selectedDocId,
  creating,
  onSelectFolder,
  onSelectDoc,
  onRefresh,
  onCancelCreate,
  onFinishCreate,
}: {
  folders: DocFolder[];
  docs: Document[];
  selectedFolderId: string | null;
  selectedDocId: string | null;
  creating: { type: 'folder' | 'doc'; parentId: string | null } | null;
  onSelectFolder: (id: string) => void;
  onSelectDoc: (id: string) => void;
  onRefresh: () => void;
  onCancelCreate: () => void;
  onFinishCreate: (name: string) => Promise<void>;
}) {
  const roots = useMemo(() => folders.filter((f) => f.parent_id === null), [folders]);
  return (
    <div className="px-2 space-y-0.5">
      {roots.map((f) => (
        <FolderTreeNode
          key={f.id}
          folder={f}
          selectedFolderId={selectedFolderId}
          selectedDocId={selectedDocId}
          creating={creating}
          onSelectFolder={onSelectFolder}
          onSelectDoc={onSelectDoc}
          onRefresh={onRefresh}
          onCancelCreate={onCancelCreate}
          onFinishCreate={onFinishCreate}
        />
      ))}
      {docs.map((d) => (
        <DocTreeNode
          key={d.id}
          doc={d}
          selectedDocId={selectedDocId}
          onSelect={onSelectDoc}
        />
      ))}
      {creating && creating.parentId === null && (
        <InlineCreator
          type={creating.type}
          onCancel={onCancelCreate}
          onFinish={onFinishCreate}
        />
      )}
    </div>
  );
}

function FolderTreeNode({
  folder,
  selectedFolderId,
  selectedDocId,
  creating,
  onSelectFolder,
  onSelectDoc,
  onRefresh,
  onCancelCreate,
  onFinishCreate,
}: {
  folder: DocFolder;
  selectedFolderId: string | null;
  selectedDocId: string | null;
  creating: { type: 'folder' | 'doc'; parentId: string | null } | null;
  onSelectFolder: (id: string) => void;
  onSelectDoc: (id: string) => void;
  onRefresh: () => void;
  onCancelCreate: () => void;
  onFinishCreate: (name: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<{ folders: DocFolder[]; docs: Document[] } | null>(null);
  const [loading, setLoading] = useState(false);

  const loadChildren = useCallback(async () => {
    if (children) return;
    setLoading(true);
    try {
      const data = await api.folderContents(folder.id);
      setChildren({ folders: data.folders, docs: data.docs as Document[] });
    } catch {
      setChildren({ folders: [], docs: [] });
    } finally {
      setLoading(false);
    }
  }, [folder.id, children]);

  const toggle = async () => {
    if (!expanded) await loadChildren();
    setExpanded(!expanded);
  };

  const rename = async () => {
    const name = window.prompt('重命名文件夹', folder.name);
    if (!name?.trim() || name.trim() === folder.name) return;
    try {
      await api.updateDocFolder(folder.id, { name: name.trim() });
      onRefresh();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const remove = async () => {
    if (!confirm('确认删除该文件夹？子文件夹和文档会移出到上级。')) return;
    try {
      await api.deleteDocFolder(folder.id);
      onRefresh();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 cursor-pointer text-sm ${
          selectedFolderId === folder.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'
        }`}
        onClick={() => onSelectFolder(folder.id)}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            void toggle();
          }}
          className={`w-4 text-[10px] text-slate-400 transition-transform ${expanded ? '' : '-rotate-90'}`}
        >
          ▼
        </button>
        <span className="text-sm">📁</span>
        <span className="flex-1 truncate font-medium">{folder.name}</span>
        <div className="hidden group-hover:flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              rename();
            }}
            title="重命名"
            className="text-slate-400 hover:text-indigo-600 px-1"
          >
            ✎
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              remove();
            }}
            title="删除"
            className="text-slate-400 hover:text-red-500 px-1"
          >
            🗑
          </button>
        </div>
      </div>
      {expanded && (
        <div className="pl-4 border-l border-slate-100 ml-3 mt-0.5 space-y-0.5">
          {loading && <div className="text-xs text-slate-400 py-1">加载中…</div>}
          {children?.folders.map((f) => (
            <FolderTreeNode
              key={f.id}
              folder={f}
              selectedFolderId={selectedFolderId}
              selectedDocId={selectedDocId}
              creating={creating}
              onSelectFolder={onSelectFolder}
              onSelectDoc={onSelectDoc}
              onRefresh={onRefresh}
              onCancelCreate={onCancelCreate}
              onFinishCreate={onFinishCreate}
            />
          ))}
          {children?.docs.map((d) => (
            <DocTreeNode key={d.id} doc={d} selectedDocId={selectedDocId} onSelect={onSelectDoc} />
          ))}
          {creating && creating.parentId === folder.id && (
            <InlineCreator type={creating.type} onCancel={onCancelCreate} onFinish={onFinishCreate} />
          )}
          {children && children.folders.length === 0 && children.docs.length === 0 && !creating && (
            <div className="text-xs text-slate-300 py-1">空</div>
          )}
        </div>
      )}
    </div>
  );
}

function DocTreeNode({
  doc,
  selectedDocId,
  onSelect,
}: {
  doc: Document;
  selectedDocId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      onClick={() => onSelect(doc.id)}
      className={`flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer text-sm ${
        selectedDocId === doc.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'
      }`}
    >
      <span className="text-sm">{doc.clip_id ? '📥' : '📝'}</span>
      <span className="flex-1 truncate">{doc.title || '未命名'}</span>
    </div>
  );
}

function FolderDetails({
  folders,
  folderId,
  onEnterFolder,
  onSelectDoc,
  onOrganize,
  onRefresh,
}: {
  folders: DocFolder[];
  folderId: string;
  onEnterFolder: (id: string) => void;
  onSelectDoc: (id: string) => void;
  onOrganize: () => void;
  onRefresh: () => void;
}) {
  const [data, setData] = useState<{ folders: DocFolder[]; docs: Document[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const path = useMemo(() => folderPath(folders, folderId), [folders, folderId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .folderContents(folderId)
      .then((res) => {
        if (active) setData({ folders: res.folders, docs: res.docs as Document[] });
      })
      .catch((e) => alert((e as Error).message))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [folderId, onRefresh]);

  return (
    <div className="h-full flex flex-col">
      <header className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1 text-sm text-slate-600 min-w-0">
          <button onClick={() => onEnterFolder('root')} className="text-slate-400 hover:text-indigo-600">
            根目录
          </button>
          {path.map((p) => (
            <span key={p.id} className="flex items-center gap-1 min-w-0">
              <span className="text-slate-300">/</span>
              <button
                onClick={() => onEnterFolder(p.id)}
                className={`truncate hover:text-indigo-600 ${p.id === folderId ? 'font-medium text-slate-800' : ''}`}
              >
                {p.name}
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onOrganize}
            className="text-xs rounded-md bg-violet-50 text-violet-700 px-2.5 py-1.5 hover:bg-violet-100"
          >
            ✨ AI 整理
          </button>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto py-2">
        {loading ? (
          <div className="h-40 flex items-center justify-center text-slate-400 text-sm">加载中…</div>
        ) : data && data.folders.length === 0 && data.docs.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center text-slate-300 text-sm">
            <span className="text-3xl mb-2">🍃</span>
            当前文件夹为空
          </div>
        ) : (
          <>
            {data?.folders.map((f) => (
              <div
                key={f.id}
                onClick={() => onEnterFolder(f.id)}
                className="mx-3 mb-1 rounded-lg px-3 py-2 cursor-pointer flex items-center gap-2 text-slate-700 hover:bg-slate-50 border border-transparent hover:border-slate-100"
              >
                <span>📁</span>
                <span className="text-sm font-medium">{f.name}</span>
              </div>
            ))}
            {data?.docs.map((d) => (
              <div
                key={d.id}
                onClick={() => onSelectDoc(d.id)}
                className="mx-3 mb-1 rounded-lg px-3 py-2 cursor-pointer flex items-start gap-2 text-slate-600 hover:bg-slate-50 border border-transparent hover:border-slate-100"
              >
                <span className="mt-0.5">{d.clip_id ? '📥' : '📝'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{d.title || '未命名'}</p>
                  {d.summary && <p className="text-[10px] text-slate-400 truncate mt-0.5">{d.summary}</p>}
                  <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2">
                    <span>{formatTime(d.updated_at)}</span>
                    {d.tags && <span className="text-slate-300 truncate">{d.tags}</span>}
                  </p>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function RootDetails({
  folders,
  docs,
  onSelectFolder,
  onSelectDoc,
  onOrganize,
  onRefresh,
}: {
  folders: DocFolder[];
  docs: Document[];
  onSelectFolder: (id: string) => void;
  onSelectDoc: (id: string) => void;
  onOrganize: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="h-full flex flex-col">
      <header className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
        <h3 className="font-semibold text-sm">根目录</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={onOrganize}
            className="text-xs rounded-md bg-violet-50 text-violet-700 px-2.5 py-1.5 hover:bg-violet-100"
          >
            ✨ AI 整理
          </button>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto py-2">
        {folders.filter((f) => f.parent_id === null).map((f) => (
          <div
            key={f.id}
            onClick={() => onSelectFolder(f.id)}
            className="mx-3 mb-1 rounded-lg px-3 py-2 cursor-pointer flex items-center gap-2 text-slate-700 hover:bg-slate-50 border border-transparent hover:border-slate-100"
          >
            <span>📁</span>
            <span className="text-sm font-medium">{f.name}</span>
          </div>
        ))}
        {docs.map((d) => (
          <div
            key={d.id}
            onClick={() => onSelectDoc(d.id)}
            className="mx-3 mb-1 rounded-lg px-3 py-2 cursor-pointer flex items-start gap-2 text-slate-600 hover:bg-slate-50 border border-transparent hover:border-slate-100"
          >
            <span className="mt-0.5">{d.clip_id ? '📥' : '📝'}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">{d.title || '未命名'}</p>
              {d.summary && <p className="text-[10px] text-slate-400 truncate mt-0.5">{d.summary}</p>}
              <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2">
                <span>{formatTime(d.updated_at)}</span>
                {d.tags && <span className="text-slate-300 truncate">{d.tags}</span>}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DocEditorShell({
  docId,
  folders,
  onBack,
  onChange,
}: {
  docId: string;
  folders: DocFolder[];
  onBack: () => void;
  onChange: () => void;
}) {
  const [doc, setDoc] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .getDocument(docId)
      .then((d) => {
        if (active) setDoc(d);
      })
      .catch((e) => alert((e as Error).message))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [docId]);

  if (loading) return <div className="h-full flex items-center justify-center text-slate-400 text-sm">加载中…</div>;
  if (!doc) return <div className="h-full flex items-center justify-center text-slate-400 text-sm">文档不存在</div>;
  return (
    <div className="h-full flex flex-col">
      <header className="px-4 py-3 border-b border-slate-200 flex items-center gap-3">
        <button onClick={onBack} className="text-xs rounded-md bg-slate-100 text-slate-600 px-2.5 py-1.5 hover:bg-slate-200">
          ← 返回
        </button>
        <span className="text-sm text-slate-400">编辑文档</span>
      </header>
      <DocEditor doc={doc} folders={folders} onChange={onChange} />
    </div>
  );
}

function DocEditor({
  doc,
  folders,
  onChange,
}: {
  doc: Document;
  folders: DocFolder[];
  onChange: () => void;
}) {
  const [title, setTitle] = useState(doc.title);
  const [tags, setTags] = useState(doc.tags ?? '');
  const [lastSaved, setLastSaved] = useState(doc.updated_at);
  const [saving, setSaving] = useState(false);
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
    [doc.id, onChange],
  );

  const scheduleSave = useCallback(
    (patch: Partial<DocumentInput>) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => save(patch), 1000);
    },
    [save],
  );

  const saveNow = useCallback(() => {
    const json = editor?.getJSON();
    save({ title, content: json ? JSON.stringify(json) : undefined, tags });
  }, [editor, save, title, tags]);

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

  const moveDoc = async (folderId: string | null) => {
    try {
      await api.updateDocument(doc.id, { folderId });
      onChange();
    } catch (e) {
      alert((e as Error).message);
    }
  };

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
          <select
            value={doc.folder_id ?? ''}
            onChange={(e) => moveDoc(e.target.value || null)}
            className="text-xs border border-slate-200 rounded-md px-2 py-1 text-slate-600 focus:outline-none"
          >
            <option value="">根目录</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
        <EditorContent editor={editor} />
      </div>
      <div className="px-4 py-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
        <span>最后保存：{formatTime(lastSaved)}</span>
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
  const [polishing, setPolishing] = useState(false);
  if (!editor) return null;

  const { from, to, empty } = editor.state.selection;

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

function InlineCreator({
  type,
  onCancel,
  onFinish,
}: {
  type: 'folder' | 'doc';
  onCancel: () => void;
  onFinish: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(type === 'folder' ? '新建文件夹' : '未命名文档');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = async () => {
    await onFinish(name);
  };

  return (
    <div className="flex items-center gap-1 rounded-lg px-2 py-1.5 bg-indigo-50 border border-indigo-200">
      <span className="text-sm">{type === 'folder' ? '📁' : '📝'}</span>
      <input
        ref={inputRef}
        className="flex-1 text-sm bg-transparent focus:outline-none"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submit();
          if (e.key === 'Escape') onCancel();
        }}
        onBlur={() => onCancel()}
      />
    </div>
  );
}

function OrganizeModal({
  folderId,
  onClose,
  onApplied,
}: {
  folderId: string | null;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<{ name: string; docIds: string[] }[]>([]);
  const [docs, setDocs] = useState<{ id: string; title: string; summary: string }[]>([]);
  const [docToFolder, setDocToFolder] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .previewAutoOrganize(folderId, folderId === null)
      .then((res) => {
        if (!active) return;
        setSuggestions(res.suggestions);
        setDocs(res.docs);
        const map: Record<string, string> = {};
        res.suggestions.forEach((s) => {
          s.docIds.forEach((id) => {
            map[id] = s.name;
          });
        });
        setDocToFolder(map);
      })
      .catch((e) => alert((e as Error).message))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [folderId]);

  const allNames = useMemo(
    () => Array.from(new Set([...suggestions.map((s) => s.name), ...Object.values(docToFolder)])),
    [suggestions, docToFolder],
  );

  const updateDocFolder = (docId: string, name: string) => {
    setDocToFolder((prev) => ({ ...prev, [docId]: name }));
  };

  const apply = async () => {
    const groups: Record<string, string[]> = {};
    docs.forEach((d) => {
      const name = docToFolder[d.id];
      if (!name) return;
      if (!groups[name]) groups[name] = [];
      groups[name].push(d.id);
    });
    const payload = Object.entries(groups).map(([name, docIds]) => ({ name, docIds }));
    try {
      await api.applyAutoOrganize(payload);
      onApplied();
      onClose();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-[720px] max-h-[80vh] bg-white rounded-2xl shadow-xl flex flex-col">
        <header className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-semibold text-sm">AI 整理归档预览</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </header>

        {loading ? (
          <div className="p-10 text-center text-sm text-slate-400">AI 分析中…</div>
        ) : (
          <>
            <div className="flex-1 overflow-hidden flex">
              <div className="w-1/3 border-r border-slate-200 p-3 overflow-y-auto">
                <p className="text-xs text-slate-400 mb-2">建议文件夹</p>
                {allNames.map((name) => (
                  <div key={name} className="flex items-center gap-2 text-sm text-slate-700 py-1">
                    <span>📁</span>
                    <span className="truncate">{name}</span>
                  </div>
                ))}
                {allNames.length === 0 && <p className="text-xs text-slate-400">无需整理</p>}
              </div>
              <div className="flex-1 p-3 overflow-y-auto">
                <p className="text-xs text-slate-400 mb-2">待归档文档</p>
                <div className="space-y-2">
                  {docs.map((d) => (
                    <div key={d.id} className="rounded-lg border border-slate-100 p-2.5">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-sm text-slate-700 truncate">{d.title}</span>
                        <select
                          value={docToFolder[d.id] ?? ''}
                          onChange={(e) => updateDocFolder(d.id, e.target.value)}
                          className="text-xs border border-slate-200 rounded-md px-2 py-1"
                        >
                          <option value="">不移动</option>
                          {allNames.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                      </div>
                      {d.summary && <p className="text-[10px] text-slate-400 truncate">{d.summary}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <footer className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
              <button onClick={onClose} className="text-xs rounded-md bg-slate-100 text-slate-600 px-3 py-1.5 hover:bg-slate-200">
                取消
              </button>
              <button
                onClick={apply}
                className="text-xs rounded-md bg-violet-600 text-white px-3 py-1.5 hover:bg-violet-700"
              >
                应用
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
