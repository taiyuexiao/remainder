import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { treeDragStore } from '../editor/treeDragStore';
import EditorShell from '../editor2/EditorShell';
import { api, type Document, type DocFolder } from '../api/client';
import { consumePendingDoc, saveDocScroll } from '../navBus';


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
  // 站内文档引用跳转历史（M33）：点文档卡片跳转时压栈，返回按钮弹栈回上一篇
  const [docHistory, setDocHistory] = useState<string[]>([]);
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

  // 编辑器内点击文档引用卡片（fe-nav-doc）→ 站内跳转并记录历史
  const selectedDocIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedDocIdRef.current = selectedDocId;
  }, [selectedDocId]);
  // 记录当前文档滚动位置（链接跳转/返回前调用）
  const saveCurrentScroll = () => {
    const cur = selectedDocIdRef.current;
    if (cur) saveDocScroll(cur, document.querySelector('.fe-content')?.scrollTop ?? 0);
  };

  useEffect(() => {
    const onNav = (e: Event) => {
      const id = (e as CustomEvent<{ docId: string }>).detail.docId;
      if (!id || id === selectedDocIdRef.current) return;
      consumePendingDoc(); // fe-nav-doc 已处理，清掉挂载时待消费的 pending
      saveCurrentScroll();
      const cur = selectedDocIdRef.current;
      if (cur) setDocHistory((h) => [...h, cur]);
      setSelectedDocId(id);
      setSelectedFolderId(null);
      setCreating(null);
    };
    window.addEventListener('fe-nav-doc', onNav);
    return () => window.removeEventListener('fe-nav-doc', onNav);
  }, []);

  // agent client_actions 跳转时本页可能尚未挂载：挂载后消费 pending 文档（M34 / A3）
  useEffect(() => {
    const pending = consumePendingDoc();
    if (pending) {
      setSelectedDocId(pending);
      setSelectedFolderId(null);
    }
  }, []);

  // 返回：有跳转历史回上一篇文档，否则回文档列表
  const goBack = () => {
    saveCurrentScroll();
    if (docHistory.length) {
      setSelectedDocId(docHistory[docHistory.length - 1]);
      setDocHistory((h) => h.slice(0, -1));
    } else {
      setSelectedDocId(null);
    }
    refresh();
  };

  const selectFolder = (id: string) => {
    setSelectedFolderId(id);
    setSelectedDocId(null);
    setCreating(null);
    setDocHistory([]);
  };

  const selectDoc = (id: string) => {
    setSelectedDocId(id);
    setSelectedFolderId(null);
    setCreating(null);
    setDocHistory([]);
  };

  const selectRoot = () => {
    setSelectedFolderId(null);
    setSelectedDocId(null);
    setCreating(null);
    setDocHistory([]);
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
          <EditorShell
            key={selectedDocId}
            docId={selectedDocId}
            onBack={goBack}
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
