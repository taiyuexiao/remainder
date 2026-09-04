import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { FontFamily } from '@tiptap/extension-font-family';
import { FontSizeAttr } from '../editor/textStyle';
import FloatToolbar from '../editor/FloatToolbar';
import OutlinePanel from '../editor/OutlinePanel';
import BlockHandle from '../editor/BlockHandle';
import { SlashCommand } from '../editor/slashCommand';
import { parseTableText, rowsToTableHtml } from '../editor/tableDetect';
import { extractStructuredText, markdownToDoc } from '../editor/mdConvert';
import { treeDragStore } from '../editor/treeDragStore';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { api, API_BASE, openExternalLink, type Document, type DocumentInput, type DocFolder, type TypoIssue } from '../api/client';

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
  const [treeKey, setTreeKey] = useState(0);
  // 手动拖拽状态（幽灵框）
  const drag = useSyncExternalStore(treeDragStore.subscribe, treeDragStore.get);

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
    setTreeKey((k) => k + 1);
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

  const startCreate = (type: 'folder' | 'doc', parentId: string | null = selectedFolderId) => {
    setCreating({ type, parentId });
  };

  const cancelCreate = () => setCreating(null);

  // 拖拽移动文档到文件夹（folderId=null 移回根级）
  const moveDoc = async (docId: string, folderId: string | null) => {
    try {
      await api.updateDocument(docId, { folderId });
      await refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  // 导入本地文件（M19）
  const importFile = async (file: File) => {
    try {
      const doc = await api.importDocument(file);
      await refresh();
      setSelectedDocId(doc.id);
      setSelectedFolderId(null);
    } catch (e) {
      alert((e as Error).message);
    }
  };

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
          <NewDropdown onCreate={startCreate} onImport={importFile} />
        </header>
        {error && <div className="px-3 py-2 text-xs text-red-500 bg-red-50">{error}</div>}
        <div className="flex-1 overflow-y-auto py-2">
          <FolderTreeRoot
            folders={folders}
            docs={rootDocs}
            selectedFolderId={selectedFolderId}
            selectedDocId={selectedDocId}
            creating={creating}
            refreshKey={treeKey}
            onSelectFolder={selectFolder}
            onSelectDoc={selectDoc}
            onRefresh={refresh}
            onStartCreate={startCreate}
            onMoveDoc={moveDoc}
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

      {/* 拖拽幽灵框（跟随指针） */}
      {drag.active && drag.docId && (
        <div
          className="fixed z-50 pointer-events-none rounded-lg bg-white shadow-lg border border-indigo-200 px-3 py-1.5 text-xs text-slate-700"
          style={{ left: drag.x + 12, top: drag.y + 12, opacity: 0.92 }}
        >
          📝 {drag.title}
        </div>
      )}
    </div>
  );
}

function NewDropdown({
  onCreate,
  onImport,
}: {
  onCreate: (type: 'folder' | 'doc') => void;
  onImport: (file: File) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
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
          <button
            onClick={() => {
              setOpen(false);
              fileRef.current?.click();
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2"
          >
            <span>📥</span> 导入文件
          </button>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".md,.markdown,.txt,.docx,.pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onImport(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}

// 文件夹行内「+」菜单：在该文件夹下新建子文件夹 / 文档
function NodeCreateMenu({ onCreate }: { onCreate: (type: 'folder' | 'doc') => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        title="新建"
        className="text-slate-400 hover:text-indigo-600 px-1"
      >
        ＋
      </button>
      {open && (
        <div className="absolute left-0 mt-1 w-28 rounded-lg bg-white shadow-lg border border-slate-200 py-1 z-20 text-xs">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onCreate('doc');
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2"
          >
            <span>📝</span> 文档
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onCreate('folder');
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2"
          >
            <span>📁</span> 子文件夹
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
  refreshKey,
  onSelectFolder,
  onSelectDoc,
  onRefresh,
  onStartCreate,
  onMoveDoc,
  onCancelCreate,
  onFinishCreate,
}: {
  folders: DocFolder[];
  docs: Document[];
  selectedFolderId: string | null;
  selectedDocId: string | null;
  creating: { type: 'folder' | 'doc'; parentId: string | null } | null;
  refreshKey: number;
  onSelectFolder: (id: string) => void;
  onSelectDoc: (id: string) => void;
  onRefresh: () => void;
  onStartCreate: (type: 'folder' | 'doc', parentId: string | null) => void;
  onMoveDoc: (docId: string, folderId: string | null) => void;
  onCancelCreate: () => void;
  onFinishCreate: (name: string) => Promise<void>;
}) {
  const roots = useMemo(() => folders.filter((f) => f.parent_id === null), [folders]);
  return (
    <div className="px-2 space-y-0.5 min-h-full" data-tree-root>
      {roots.map((f) => (
        <FolderTreeNode
          key={f.id}
          folder={f}
          selectedFolderId={selectedFolderId}
          selectedDocId={selectedDocId}
          creating={creating}
          refreshKey={refreshKey}
          onSelectFolder={onSelectFolder}
          onSelectDoc={onSelectDoc}
          onRefresh={onRefresh}
          onStartCreate={onStartCreate}
          onMoveDoc={onMoveDoc}
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
          onMoveDoc={onMoveDoc}
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
  refreshKey,
  onSelectFolder,
  onSelectDoc,
  onRefresh,
  onStartCreate,
  onMoveDoc,
  onCancelCreate,
  onFinishCreate,
}: {
  folder: DocFolder;
  selectedFolderId: string | null;
  selectedDocId: string | null;
  creating: { type: 'folder' | 'doc'; parentId: string | null } | null;
  refreshKey: number;
  onSelectFolder: (id: string) => void;
  onSelectDoc: (id: string) => void;
  onRefresh: () => void;
  onStartCreate: (type: 'folder' | 'doc', parentId: string | null) => void;
  onMoveDoc: (docId: string, folderId: string | null) => void;
  onCancelCreate: () => void;
  onFinishCreate: (name: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<{ folders: DocFolder[]; docs: Document[] } | null>(null);
  const [loading, setLoading] = useState(false);
  // 手动拖拽：本行是否为悬停目标
  const dragHover = useSyncExternalStore(treeDragStore.subscribe, () => treeDragStore.get().hover);

  const reloadChildren = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.folderContents(folder.id);
      setChildren({ folders: data.folders, docs: data.docs as Document[] });
    } catch {
      setChildren({ folders: [], docs: [] });
    } finally {
      setLoading(false);
    }
  }, [folder.id]);

  const loadChildren = useCallback(async () => {
    if (children) return;
    await reloadChildren();
  }, [children, reloadChildren]);

  // 外部 refresh（如新建/删除/整理）后，展开的节点重新加载子级
  useEffect(() => {
    if (expanded) void reloadChildren();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const toggle = async () => {
    if (!expanded) await loadChildren();
    setExpanded(!expanded);
  };

  // 在该文件夹下新建：确保展开并加载子级，再挂内联输入框
  const startCreateHere = async (type: 'folder' | 'doc') => {
    if (!children) await loadChildren();
    setExpanded(true);
    onStartCreate(type, folder.id);
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
        data-folder-id={folder.id}
        className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 cursor-pointer text-sm ${
          dragHover === folder.id
            ? 'bg-indigo-100 ring-1 ring-indigo-300 text-indigo-700'
            : selectedFolderId === folder.id
              ? 'bg-indigo-50 text-indigo-700'
              : 'text-slate-700 hover:bg-slate-50'
        }`}
        onClick={() => {
          onSelectFolder(folder.id);
          void toggle();
        }}
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
          <NodeCreateMenu onCreate={(type) => void startCreateHere(type)} />
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
              refreshKey={refreshKey}
              onSelectFolder={onSelectFolder}
              onSelectDoc={onSelectDoc}
              onRefresh={onRefresh}
              onStartCreate={onStartCreate}
              onMoveDoc={onMoveDoc}
              onCancelCreate={onCancelCreate}
              onFinishCreate={onFinishCreate}
            />
          ))}
          {children?.docs.map((d) => (
            <DocTreeNode key={d.id} doc={d} selectedDocId={selectedDocId} onSelect={onSelectDoc} onMoveDoc={onMoveDoc} />
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
  onMoveDoc,
}: {
  doc: Document;
  selectedDocId: string | null;
  onSelect: (id: string) => void;
  onMoveDoc: (docId: string, folderId: string | null) => void;
}) {
  // 鼠标自实现拖拽（HTML5 DnD 在 Tauri WebView2 不稳定）：
  // 位移 >6px 进入拖拽态，elementFromPoint 判定悬停目标，松手执行移动；未位移 = 单击选中
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;
    const onMove = (ev: MouseEvent) => {
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) > 6) {
        moved = true;
        treeDragStore.set({ docId: doc.id, title: doc.title || '未命名', active: true });
      }
      if (moved) {
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const folderRow = el?.closest('[data-folder-id]');
        const rootEl = el?.closest('[data-tree-root]');
        treeDragStore.set({
          x: ev.clientX,
          y: ev.clientY,
          hover: folderRow ? folderRow.getAttribute('data-folder-id') : rootEl ? 'root' : null,
        });
      }
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (!moved) {
        onSelect(doc.id);
        return;
      }
      const { hover } = treeDragStore.get();
      treeDragStore.reset();
      if (hover === 'root') onMoveDoc(doc.id, null);
      else if (hover) onMoveDoc(doc.id, hover);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div
      onMouseDown={onMouseDown}
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
        <span className="flex-1" />
        <button
          onClick={async () => {
            try {
              const { path } = await api.exportDocument(docId);
              alert(`已导出到本地：${path}`);
            } catch (e) {
              alert((e as Error).message);
            }
          }}
          className="text-xs rounded-md bg-slate-100 text-slate-600 px-2.5 py-1.5 hover:bg-slate-200"
          title="导出为 Markdown 到本地 exports 目录"
        >
          ⬇ 导出到本地
        </button>
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
  // 询问 LLM 面板（M16）：选中内容 + 提问 → 回答可补充/替换/评论进文档
  const [ai, setAi] = useState<{
    text: string; from: number; to: number;
    question: string; answer: string; loading: boolean;
  } | null>(null);
  // 大纲侧栏（M21）
  const [outlineOpen, setOutlineOpen] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Image,
      Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
      FontFamily,
      FontSizeAttr,
      SlashCommand,
      Placeholder.configure({ placeholder: '输入内容…，键入 / 唤起快捷菜单' }),
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
        // 表格状纯文本自动识别（M14）：剪贴板本身带 <table> 时交给默认处理
        const html = event.clipboardData?.getData('text/html') ?? '';
        if (!/<table[\s>]/i.test(html)) {
          const text = event.clipboardData?.getData('text/plain') ?? '';
          const rows = text ? parseTableText(text) : null;
          if (rows) {
            editor?.chain().focus().insertContent(rowsToTableHtml(rows)).run();
            return true;
          }
        }
        return false;
      },
      // Ctrl/Cmd+点击链接 → 系统浏览器打开（M14）
      handleClick: (view, pos, event) => {
        if (!(event.ctrlKey || event.metaKey)) return false;
        const linkMark = view.state.doc.resolve(pos).marks().find((m) => m.type.name === 'link');
        const href = linkMark?.attrs.href as string | undefined;
        if (href) {
          void openExternalLink(href);
          return true;
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

  /* ---------- 错别字流处理（M18）：停顿 2.5s 扫描当前段落，仅修错别字 ---------- */
  const [typoStreamOn, setTypoStreamOn] = useState(() => localStorage.getItem('typo-stream') === '1');
  const typoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typoSeq = useRef(0);
  const lastScanned = useRef('');

  const toggleTypoStream = () => {
    setTypoStreamOn((v) => {
      localStorage.setItem('typo-stream', v ? '0' : '1');
      return !v;
    });
  };

  useEffect(() => {
    if (!editor || !typoStreamOn) return;
    const handler = () => {
      if (typoTimer.current) clearTimeout(typoTimer.current);
      typoTimer.current = setTimeout(() => void scanTypos(), 2500);
    };
    const scanTypos = async () => {
      const { $from } = editor.state.selection;
      if ($from.depth < 1) return;
      const block = $from.node(1);
      if (block.type.name !== 'paragraph') return; // 只扫正文段落（代码块/表格等跳过）
      if (block.content.size !== block.textContent.length) return; // 含图片等非文本内联，跳过
      const text = block.textContent;
      if (text.trim().length < 8 || text === lastScanned.current) return;
      const blockStart = $from.start(1);
      const seq = ++typoSeq.current;
      lastScanned.current = text;
      try {
        const { result } = await api.fixTypos(text);
        if (seq !== typoSeq.current || !result || result === text) return;
        // 校验段落未被改动（用户又打字了则丢弃）
        const nodeNow = editor.state.doc.nodeAt($from.before(1));
        if (!nodeNow || nodeNow.textContent !== text) return;
        // 首尾公共 diff：只替换差异片段，尽量保留段落内 marks
        let p = 0;
        while (p < text.length && p < result.length && text[p] === result[p]) p++;
        let s = 0;
        while (
          s < text.length - p &&
          s < result.length - s &&
          text[text.length - 1 - s] === result[result.length - 1 - s]
        ) s++;
        const from = blockStart + p;
        const to = blockStart + (text.length - s);
        editor.chain().insertContentAt({ from, to }, result.slice(p, result.length - s)).run();
      } catch {
        /* 静默失败，不打断写作 */
      }
    };
    editor.on('update', handler);
    return () => {
      editor.off('update', handler);
      if (typoTimer.current) clearTimeout(typoTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, typoStreamOn]);

  const moveDoc = async (folderId: string | null) => {
    try {
      await api.updateDocument(doc.id, { folderId });
      onChange();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  // 浮动工具栏 ✨ 入口：捕获当前选区并打开询问面板
  const openAskAi = () => {
    if (!editor) return;
    const { from, to, empty } = editor.state.selection;
    if (empty) return;
    const text = editor.state.doc.textBetween(from, to, ' ', ' ');
    if (!text.trim()) return;
    setAi({ text, from, to, question: '', answer: '', loading: false });
  };

  const askAi = async () => {
    if (!ai || !ai.question.trim() || ai.loading) return;
    setAi({ ...ai, loading: true, answer: '' });
    try {
      const { result } = await api.askLlm(ai.text, ai.question.trim());
      setAi((prev) => (prev ? { ...prev, answer: result, loading: false } : null));
    } catch (e) {
      setAi((prev) => (prev ? { ...prev, answer: `调用失败：${(e as Error).message}`, loading: false } : null));
    }
  };

  // 把 LLM 回答沉淀进文档：补充（下方引用块）/ 替换选段 / 评论（💬引用块）
  const applyAiAnswer = (mode: 'append' | 'replace' | 'comment') => {
    if (!editor || !ai?.answer) return;
    const esc = ai.answer
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .split('\n').filter((l) => l.trim()).map((l) => `<p>${l}</p>`).join('');
    if (mode === 'replace') {
      editor.chain().focus().insertContentAt({ from: ai.from, to: ai.to }, esc).run();
    } else if (mode === 'append') {
      editor.chain().focus().insertContentAt(ai.to, `<blockquote>🤖 ${esc}</blockquote>`).run();
    } else {
      editor.chain().focus().insertContentAt(ai.to, `<blockquote><p>💬 <b>评论：</b></p>${esc}</blockquote>`).run();
    }
    setAi(null);
  };

  return (
    <div className="h-full flex flex-col relative">
      {/* 顶部操作组（M21 飞书式：无常驻格式工具栏，仅文档级/AI 操作） */}
      <EditorActions
        editor={editor}
        typoStreamOn={typoStreamOn}
        onToggleTypoStream={toggleTypoStream}
        outlineOpen={outlineOpen}
        onToggleOutline={() => setOutlineOpen((v) => !v)}
      />

      {/* 页面区：居中 760px（飞书式） */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[760px] mx-auto px-8 pb-24">
          <input
            className="w-full pt-10 pb-3 text-[32px] leading-snug font-bold text-slate-800 placeholder:text-slate-300 focus:outline-none bg-transparent"
            placeholder="请输入标题"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              scheduleSave({ title: e.target.value });
            }}
          />
          {/* 元信息行：低对比、不占视觉 */}
          <div className="pb-4 mb-2 border-b border-slate-100 flex items-center gap-3 text-[11px] text-slate-300">
            <span className="shrink-0">🏷</span>
            <input
              className="w-36 text-slate-400 placeholder:text-slate-300 focus:outline-none bg-transparent"
              placeholder="标签（逗号分隔）"
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
                className="text-indigo-300 hover:text-indigo-500 hover:underline"
              >
                来源：{hostOf(doc.source_url)}
              </a>
            )}
            <span className="flex-1" />
            <span>{saving ? '保存中…' : `已保存 · ${formatTime(lastSaved)}`}</span>
          </div>
          <div className="relative">
            <EditorContent editor={editor} />
            {/* 块手柄（M21 飞书式 ⋮⋮/+） */}
            {editor && <BlockHandle editor={editor} />}
          </div>
        </div>
      </div>

      {/* 大纲侧栏 */}
      {editor && <OutlinePanel editor={editor} open={outlineOpen} />}

      {/* 飞书式选中文本浮动工具栏（M15）+ ✨ 询问 LLM（M16） */}
      {/* 飞书式选中文本浮动工具栏（M15）+ ✨ 询问 LLM（M16）
          外层固定槽位：BubbleMenu 的内联 div 会被 tippy 移动到 popper，
          若不隔离，兄弟节点条件渲染会触发 React insertBefore 报错 */}
      <div>
        {editor && <FloatToolbar editor={editor} onAskAi={openAskAi} />}
      </div>

      {/* 询问 LLM 面板 */}
      {ai && (
        <div className="fixed right-6 top-16 z-40 w-[380px] rounded-xl bg-white shadow-2xl border border-violet-200 flex flex-col overflow-hidden">
          <div className="px-3 py-2 bg-violet-50 border-b border-violet-100 flex items-center justify-between">
            <span className="text-xs font-medium text-violet-700">✨ 询问 LLM</span>
            <button onClick={() => setAi(null)} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
          </div>
          <div className="px-3 py-2 text-[11px] text-slate-500 bg-slate-50 max-h-16 overflow-y-auto border-b border-slate-100">
            选中：{ai.text.slice(0, 120)}{ai.text.length > 120 ? '…' : ''}
          </div>
          <div className="p-3 space-y-2">
            <div className="flex gap-1.5">
              <input
                autoFocus
                className="flex-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-violet-300"
                placeholder="就选中内容提问，如：这段什么意思？"
                value={ai.question}
                onChange={(e) => setAi({ ...ai, question: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && askAi()}
              />
              <button
                onClick={askAi}
                disabled={ai.loading || !ai.question.trim()}
                className="rounded-lg bg-violet-600 text-white text-xs px-3 py-1.5 hover:bg-violet-700 disabled:opacity-40"
              >
                {ai.loading ? '思考中…' : '提问'}
              </button>
            </div>
            {ai.answer && (
              <>
                <div className="max-h-48 overflow-y-auto rounded-lg bg-violet-50/50 border border-violet-100 px-3 py-2 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {ai.answer}
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => applyAiAnswer('append')} className="flex-1 rounded-lg bg-indigo-50 text-indigo-600 text-xs px-2 py-1.5 hover:bg-indigo-100" title="以引用块插入到选段下方">
                    ⬇ 补充到下方
                  </button>
                  <button onClick={() => applyAiAnswer('replace')} className="flex-1 rounded-lg bg-amber-50 text-amber-600 text-xs px-2 py-1.5 hover:bg-amber-100" title="用回答替换选中内容">
                    ⇄ 替换选段
                  </button>
                  <button onClick={() => applyAiAnswer('comment')} className="flex-1 rounded-lg bg-slate-100 text-slate-600 text-xs px-2 py-1.5 hover:bg-slate-200" title="以评论形式插入到选段下方">
                    💬 作为评论
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** 在文档中定位并应用单条错别字修正（M18） */
function applyOneTypo(editor: NonNullable<ReturnType<typeof useEditor>>, issue: TypoIssue) {
  let done = false;
  editor.state.doc.descendants((node, pos) => {
    if (done || !node.isTextblock) return false;
    const text = node.textContent;
    const ctx = issue.context || issue.before;
    const ci = text.indexOf(ctx);
    let idx = ci >= 0 ? text.indexOf(issue.before, ci) : -1;
    if (idx < 0) idx = text.indexOf(issue.before);
    if (idx < 0) return false;
    const from = pos + 1 + idx;
    editor.chain().insertContentAt({ from, to: from + issue.before.length }, issue.after).run();
    done = true;
    return false;
  });
}

/** 顶部操作组（M21 飞书式：无常驻格式工具栏，仅文档级/AI 操作 + 大纲开关） */
function EditorActions({
  editor,
  typoStreamOn,
  onToggleTypoStream,
  outlineOpen,
  onToggleOutline,
}: {
  editor: ReturnType<typeof useEditor>;
  typoStreamOn: boolean;
  onToggleTypoStream: () => void;
  outlineOpen: boolean;
  onToggleOutline: () => void;
}) {
  const [formatting, setFormatting] = useState(false);
  // 错别字批处理（M18）
  const [checking, setChecking] = useState(false);
  const [typoIssues, setTypoIssues] = useState<TypoIssue[] | null>(null);
  const [typoChecked, setTypoChecked] = useState<boolean[]>([]);
  if (!editor) return null;

  // 批处理：全文扫描 → 弹窗展示问题清单
  const runTypoCheck = async () => {
    if (checking) return;
    setChecking(true);
    try {
      const { issues } = await api.checkTypos(editor.getText({ blockSeparator: '\n' }));
      if (!issues.length) {
        alert('未发现错别字 ✓');
        return;
      }
      setTypoIssues(issues);
      setTypoChecked(issues.map(() => true));
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setChecking(false);
    }
  };

  const applyTypoCheck = (forceAll: boolean) => {
    if (!typoIssues) return;
    typoIssues.forEach((issue, i) => {
      if (forceAll || typoChecked[i]) applyOneTypo(editor, issue);
    });
    setTypoIssues(null);
  };

  // AI 排版（M16）：LLM 通读全文，规范标题层级与列表结构
  const aiFormat = async () => {
    if (formatting) return;
    if (!confirm('AI 将通读全文并规范标题层级与列表结构。\n注意：颜色/高亮等行内样式会丢失，建议重要文档先导出备份。继续？')) return;
    setFormatting(true);
    try {
      const { result } = await api.formatDoc(extractStructuredText(editor));
      editor.commands.setContent(markdownToDoc(result));
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setFormatting(false);
    }
  };

  const ABtn = ({
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
      className={`px-2 py-1 rounded-lg text-xs transition-colors whitespace-nowrap ${
        active ? 'bg-violet-100 text-violet-700' : 'text-slate-500 hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  );

  return (
    <>
      <div className="absolute right-4 top-3 z-20 flex items-center gap-0.5 rounded-xl bg-white/95 backdrop-blur border border-slate-200 shadow-sm px-1.5 py-1">
        <ABtn onClick={onToggleOutline} active={outlineOpen} title="大纲目录">
          ☰ 大纲
        </ABtn>
        <span className="w-px h-4 bg-slate-200" />
        <ABtn onClick={aiFormat} title="AI 通读全文，规范标题层级与列表结构">
          {formatting ? '排版中…' : '✨ AI 排版'}
        </ABtn>
        <ABtn onClick={onToggleTypoStream} active={typoStreamOn} title="停顿 2.5s 自动扫描当前段落并修正错别字">
          {typoStreamOn ? '✓ 流式纠错' : '流式纠错'}
        </ABtn>
        <ABtn onClick={runTypoCheck} title="全文扫描错别字，先展示问题清单再决定应用">
          {checking ? '检查中…' : '错别字检查'}
        </ABtn>
      </div>

      {/* 错别字批处理弹窗（M18） */}
      {typoIssues && (
        <div className="fixed inset-0 z-50 bg-slate-900/30 flex items-center justify-center" onClick={() => setTypoIssues(null)}>
          <div
            className="w-[540px] max-h-[70vh] rounded-2xl bg-white shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-800">发现 {typoIssues.length} 处疑似错别字</span>
              <button onClick={() => setTypoIssues(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-2">
              {typoIssues.map((issue, i) => (
                <label key={i} className="flex items-start gap-2.5 py-2 border-b border-slate-50 last:border-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={typoChecked[i]}
                    onChange={(e) =>
                      setTypoChecked((prev) => prev.map((v, j) => (j === i ? e.target.checked : v)))
                    }
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs">
                      <span className="line-through text-rose-500">{issue.before}</span>
                      <span className="mx-1.5 text-slate-400">→</span>
                      <span className="text-emerald-600 font-medium">{issue.after}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 truncate">…{issue.context}…</div>
                  </div>
                </label>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setTypoIssues(null)}
                className="rounded-lg bg-slate-100 text-slate-600 text-xs px-3 py-1.5 hover:bg-slate-200"
              >
                取消
              </button>
              <button
                onClick={() => applyTypoCheck(false)}
                className="rounded-lg bg-white border border-violet-300 text-violet-600 text-xs px-3 py-1.5 hover:bg-violet-50"
              >
                应用选中（{typoChecked.filter(Boolean).length}）
              </button>
              <button
                onClick={() => applyTypoCheck(true)}
                className="rounded-lg bg-violet-600 text-white text-xs px-3 py-1.5 hover:bg-violet-700"
              >
                全部应用
              </button>
            </div>
          </div>
        </div>
      )}
    </>
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