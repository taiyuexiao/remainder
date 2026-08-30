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

// 把平铺 folder 数组组装成树
function buildTree(folders: DocFolder[]): (DocFolder & { children: ReturnType<typeof buildTree> })[] {
  const map = new Map<string, DocFolder & { children: any[] }>();
  folders.forEach((f) => map.set(f.id, { ...f, children: [] }));
  const roots: (DocFolder & { children: any[] })[] = [];
  folders.forEach((f) => {
    if (f.parent_id) {
      const parent = map.get(f.parent_id);
      if (parent) parent.children.push(map.get(f.id)!);
    } else {
      roots.push(map.get(f.id)!);
    }
  });
  roots.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  return roots;
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
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [childFolders, setChildFolders] = useState<DocFolder[]>([]);
  const [docs, setDocs] = useState<Document[]>([]);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [creatingDoc, setCreatingDoc] = useState(false);
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

  const loadContents = useCallback(async (folderId: string) => {
    try {
      const data = await api.folderContents(folderId);
      setChildFolders(data.folders);
      setDocs(data.docs as Document[]);
      setError('');
    } catch (e) {
      setError(`加载内容失败：${(e as Error).message}`);
    }
  }, []);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  useEffect(() => {
    if (currentFolderId) {
      loadContents(currentFolderId);
    } else {
      setChildFolders([]);
      setDocs([]);
    }
  }, [currentFolderId, loadContents]);

  const tree = useMemo(() => buildTree(folders), [folders]);

  const selectFolder = (id: string) => {
    setSelectedFolderId(id);
    setCurrentFolderId(id);
    setEditingDocId(null);
  };

  const enterFolder = (id: string) => {
    setCurrentFolderId(id);
    setEditingDocId(null);
  };

  const selectDoc = (id: string) => {
    setEditingDocId(id);
  };

  const backToList = () => {
    setEditingDocId(null);
  };

  const createFolder = async (parentId: string | null) => {
    const name = window.prompt(parentId ? '新建子文件夹名称' : '新建文件夹名称');
    if (!name?.trim()) return;
    try {
      await api.createDocFolder({ name: name.trim(), parentId });
      await loadFolders();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const createDoc = async (folderId: string | null) => {
    const target = folderId ?? selectedFolderId ?? currentFolderId;
    if (!target) {
      alert('请先选择一个文件夹');
      return;
    }
    setCreatingDoc(true);
    try {
      const doc = await api.createDocument({ title: '未命名文档', folderId: target });
      await loadContents(target);
      setEditingDocId(doc.id);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setCreatingDoc(false);
    }
  };

  const deleteFolder = async (id: string) => {
    if (!confirm('确认删除该文件夹？子文件夹和文档会移入默认文件夹。')) return;
    try {
      await api.deleteDocFolder(id);
      if (selectedFolderId === id) {
        setSelectedFolderId(null);
        setCurrentFolderId(null);
      }
      await loadFolders();
      if (currentFolderId && currentFolderId !== id) await loadContents(currentFolderId);
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const renameFolder = async (id: string, current: string) => {
    const name = window.prompt('重命名文件夹', current);
    if (!name?.trim() || name.trim() === current) return;
    try {
      await api.updateDocFolder(id, { name: name.trim() });
      await loadFolders();
      if (currentFolderId) await loadContents(currentFolderId);
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const refresh = async () => {
    await loadFolders();
    if (currentFolderId) await loadContents(currentFolderId);
  };

  return (
    <div className="h-full flex">
      {/* 主栏目：文件夹树 */}
      <aside className="w-56 shrink-0 bg-white border-r border-slate-200 flex flex-col">
        <header className="px-3 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold text-sm">文件夹</h2>
          <NewDropdown
            label="+"
            onNewFolder={() => createFolder(null)}
            onNewDoc={() => createDoc(null)}
            docDisabled={!selectedFolderId && !currentFolderId}
          />
        </header>
        {error && <div className="px-3 py-2 text-xs text-red-500 bg-red-50">{error}</div>}
        <div className="flex-1 overflow-y-auto py-2">
          <FolderTree
            nodes={tree}
            selectedId={selectedFolderId}
            onSelect={selectFolder}
            onCreateFolder={createFolder}
            onRename={renameFolder}
            onDelete={deleteFolder}
          />
        </div>
      </aside>

      {/* 副栏目：内容区 / 编辑器 */}
      <main className="flex-1 min-w-0 bg-white flex flex-col">
        {editingDocId ? (
          <DocEditorShell
            docId={editingDocId}
            folders={folders}
            onBack={backToList}
            onChange={refresh}
          />
        ) : currentFolderId ? (
          <FolderContents
            folders={folders}
            currentId={currentFolderId}
            childFolders={childFolders}
            docs={docs}
            onEnterFolder={enterFolder}
            onSelectDoc={selectDoc}
            onCreateFolder={() => createFolder(currentFolderId)}
            onCreateDoc={() => createDoc(currentFolderId)}
            onOrganize={() => setOrganizeOpen(true)}
            creatingDoc={creatingDoc}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-300">
            <div className="text-5xl mb-4">📁</div>
            <p className="text-sm">选择一个文件夹开始</p>
          </div>
        )}
      </main>

      {organizeOpen && currentFolderId && (
        <OrganizeModal
          folderId={currentFolderId}
          onClose={() => setOrganizeOpen(false)}
          onApplied={refresh}
        />
      )}
    </div>
  );
}

function NewDropdown({
  label,
  onNewFolder,
  onNewDoc,
  docDisabled,
}: {
  label: string;
  onNewFolder: () => void;
  onNewDoc: () => void;
  docDisabled?: boolean;
}) {
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
        {label}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-28 rounded-lg bg-white shadow-lg border border-slate-200 py-1 z-20 text-xs">
          <button
            onClick={() => {
              setOpen(false);
              onNewFolder();
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2"
          >
            <span>📁</span> 文件夹
          </button>
          <button
            onClick={() => {
              setOpen(false);
              onNewDoc();
            }}
            disabled={docDisabled}
            className="w-full text-left px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white flex items-center gap-2"
          >
            <span>📝</span> 文档
          </button>
        </div>
      )}
    </div>
  );
}

function FolderTree({
  nodes,
  selectedId,
  onSelect,
  onCreateFolder,
  onRename,
  onDelete,
}: {
  nodes: (DocFolder & { children: any[] })[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreateFolder: (parentId: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="px-2 space-y-0.5">
      {nodes.map((node) => (
        <FolderNode
          key={node.id}
          node={node}
          selectedId={selectedId}
          onSelect={onSelect}
          onCreateFolder={onCreateFolder}
          onRename={onRename}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

function FolderNode({
  node,
  selectedId,
  onSelect,
  onCreateFolder,
  onRename,
  onDelete,
}: {
  node: DocFolder & { children: any[] };
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreateFolder: (parentId: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 cursor-pointer text-sm ${
          selectedId === node.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'
        }`}
        onClick={() => onSelect(node.id)}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) setExpanded(!expanded);
          }}
          className={`w-4 text-[10px] text-slate-400 transition-transform ${expanded ? '' : '-rotate-90'} ${
            hasChildren ? '' : 'invisible'
          }`}
        >
          ▼
        </button>
        <span className="text-sm">📁</span>
        <span className="flex-1 truncate">{node.name}</span>
        <div className="hidden group-hover:flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCreateFolder(node.id);
            }}
            title="新建子文件夹"
            className="text-slate-400 hover:text-indigo-600 px-1"
          >
            +
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRename(node.id, node.name);
            }}
            title="重命名"
            className="text-slate-400 hover:text-indigo-600 px-1"
          >
            ✎
          </button>
          {node.id !== 'default' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(node.id);
              }}
              title="删除"
              className="text-slate-400 hover:text-red-500 px-1"
            >
              🗑
            </button>
          )}
        </div>
      </div>
      {expanded && hasChildren && (
        <div className="pl-4 border-l border-slate-100 ml-3 mt-0.5 space-y-0.5">
          <FolderTree
            nodes={node.children}
            selectedId={selectedId}
            onSelect={onSelect}
            onCreateFolder={onCreateFolder}
            onRename={onRename}
            onDelete={onDelete}
          />
        </div>
      )}
    </div>
  );
}

function FolderContents({
  folders,
  currentId,
  childFolders,
  docs,
  onEnterFolder,
  onSelectDoc,
  onCreateFolder,
  onCreateDoc,
  onOrganize,
  creatingDoc,
}: {
  folders: DocFolder[];
  currentId: string;
  childFolders: DocFolder[];
  docs: Document[];
  onEnterFolder: (id: string) => void;
  onSelectDoc: (id: string) => void;
  onCreateFolder: () => void;
  onCreateDoc: () => void;
  onOrganize: () => void;
  creatingDoc: boolean;
}) {
  const path = useMemo(() => folderPath(folders, currentId), [folders, currentId]);

  return (
    <div className="h-full flex flex-col">
      <header className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1 text-sm text-slate-600 min-w-0">
          {path.map((p, i) => (
            <span key={p.id} className="flex items-center gap-1 min-w-0">
              {i > 0 && <span className="text-slate-300">/</span>}
              <button
                onClick={() => onEnterFolder(p.id)}
                className={`truncate hover:text-indigo-600 ${i === path.length - 1 ? 'font-medium text-slate-800' : ''}`}
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
          <NewDropdown label="+ 新建" onNewFolder={onCreateFolder} onNewDoc={onCreateDoc} />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto py-2">
        {creatingDoc && (
          <div className="mx-3 mb-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">创建文档中…</div>
        )}

        {childFolders.length === 0 && docs.length === 0 && (
          <div className="h-40 flex flex-col items-center justify-center text-slate-300 text-sm">
            <span className="text-3xl mb-2">🍃</span>
            当前文件夹为空
          </div>
        )}

        {childFolders.map((f) => (
          <div
            key={f.id}
            onClick={() => onEnterFolder(f.id)}
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

  const moveDoc = async (folderId: string) => {
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
            onChange={(e) => moveDoc(e.target.value)}
            className="text-xs border border-slate-200 rounded-md px-2 py-1 text-slate-600 focus:outline-none"
          >
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
        <span>{saving ? '保存中…' : '已自动保存'}</span>
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

function OrganizeModal({
  folderId,
  onClose,
  onApplied,
}: {
  folderId: string;
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
      .previewAutoOrganize(folderId, false)
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
