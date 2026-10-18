import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { treeDragStore } from '../editor/treeDragStore';
import EditorShell from '../editor2/EditorShell';
import { api, type Document, type DocFolder } from '../api/client';
import { consumePendingDoc, saveDocScroll } from '../navBus';
import { useImeGuard } from '../ime';
import {
  IconFolder, IconFile, IconChevronRight, IconChevronLeft, IconPlus, IconPencil, IconTrash,
  IconClose, IconImport, IconSparkles, IconFolderOpen,
} from '../components/NavIcons';


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
  // M40：中间栏目钻取栈——双击文件夹独占树视图，返回逐级弹出
  const [drillStack, setDrillStack] = useState<string[]>([]);
  const drillId = drillStack[drillStack.length - 1] ?? null;
  // M40：样式化弹窗与 toast（替代 window.prompt / confirm / alert）
  const [renameTarget, setRenameTarget] = useState<{ type: 'folder'; id: string; name: string } | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; name: string } | null>(null);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }, []);

  const showError = useCallback((e: unknown) => showToast(`操作失败：${(e as Error).message}`), [showToast]);

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

  // M40：双击钻取 / 返回（右侧详情同步跟随栈顶）
  const drillInto = useCallback((id: string) => {
    setDrillStack((s) => [...s, id]);
    setSelectedFolderId(id);
    setSelectedDocId(null);
    setCreating(null);
    setDocHistory([]);
  }, []);

  const drillBack = useCallback(() => {
    setDrillStack((s) => {
      const next = s.slice(0, -1);
      setSelectedFolderId(next[next.length - 1] ?? null);
      return next;
    });
  }, []);

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
      showError(e);
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
      showError(e);
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
      showError(e);
    }
  };

  // M40：重命名 / 删除确认（替代 window.prompt / confirm）
  const submitRename = async (name: string) => {
    if (!renameTarget) return;
    const { id } = renameTarget;
    const trimmed = name.trim();
    setRenameTarget(null);
    if (!trimmed) return;
    try {
      await api.updateDocFolder(id, { name: trimmed });
      await refresh();
    } catch (e) {
      showError(e);
    }
  };

  const submitDelete = async () => {
    if (!confirmTarget) return;
    const { id } = confirmTarget;
    setConfirmTarget(null);
    try {
      await api.deleteDocFolder(id);
      // 若删的是钻取路径上的文件夹，弹出栈保持一致
      setDrillStack((s) => {
        const next = s.filter((x) => x !== id);
        setSelectedFolderId((cur) => (cur === id ? next[next.length - 1] ?? null : cur));
        return next;
      });
      await refresh();
      showToast('文件夹已删除');
    } catch (e) {
      showError(e);
    }
  };

  const drillFolderName = useMemo(
    () => folders.find((f) => f.id === drillId)?.name ?? '',
    [folders, drillId],
  );

  return (
    <div className="h-full flex bg-white">
      {/* 中间栏目：文件树（M40 支持双击钻取独占） */}
      <aside className="w-64 shrink-0 bg-white border-r border-[var(--border-light)] flex flex-col">
        <header className="px-3 py-2.5 border-b border-[var(--border-light)] flex items-center justify-between gap-1">
          {drillId ? (
            <>
              <button
                onClick={drillBack}
                title="返回上一级"
                className="w-7 h-7 shrink-0 rounded-md text-[var(--text-2)] hover:bg-[var(--bg-2)] hover:text-[var(--text-1)] flex items-center justify-center"
              >
                <IconChevronLeft size={16} />
              </button>
              <h2 className="font-semibold text-sm text-[var(--text-1)] flex-1 truncate">{drillFolderName}</h2>
            </>
          ) : (
            <h2 className="font-semibold text-sm text-[var(--text-1)] flex-1">文档</h2>
          )}
          <NewDropdown onCreate={startCreate} onImport={importFile} />
        </header>
        {error && <div className="px-3 py-2 text-xs text-[var(--danger)] bg-[rgba(245,74,69,0.06)]">{error}</div>}
        <div className="flex-1 overflow-y-auto py-2">
          {drillId ? (
            <DrilledTree
              key={`${drillId}-${treeKey}`}
              folders={folders}
              folderId={drillId}
              selectedFolderId={selectedFolderId}
              selectedDocId={selectedDocId}
              creating={creating}
              onSelectFolder={selectFolder}
              onSelectDoc={selectDoc}
              onDrill={drillInto}
              onRefresh={refresh}
              onStartCreate={startCreate}
              onMoveDoc={moveDoc}
              onCancelCreate={cancelCreate}
              onFinishCreate={finishCreate}
              onRenameFolder={(f) => setRenameTarget({ type: 'folder', id: f.id, name: f.name })}
              onDeleteFolder={(f) => setConfirmTarget({ id: f.id, name: f.name })}
            />
          ) : (
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
              onRenameFolder={(f) => setRenameTarget({ type: 'folder', id: f.id, name: f.name })}
              onDeleteFolder={(f) => setConfirmTarget({ id: f.id, name: f.name })}
              onDrill={drillInto}
            />
          )}
        </div>
      </aside>

      {/* 右侧栏目：内容区 / 编辑器 */}
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
            onEnterRoot={() => { selectRoot(); setDrillStack([]); }}
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

      {/* M40：重命名弹窗（替代 window.prompt） */}
      {renameTarget && (
        <InputModal
          title="重命名文件夹"
          initialValue={renameTarget.name}
          onCancel={() => setRenameTarget(null)}
          onSubmit={submitRename}
        />
      )}

      {/* M40：删除确认弹窗（替代 window.confirm） */}
      {confirmTarget && (
        <ConfirmModal
          title="删除文件夹"
          body={`确认删除「${confirmTarget.name}」？子文件夹和文档会移出到上级。`}
          confirmText="删除"
          onCancel={() => setConfirmTarget(null)}
          onConfirm={submitDelete}
        />
      )}

      {toast && <div className="fe-toast">{toast}</div>}

      {/* 拖拽幽灵框（跟随指针） */}
      {drag.active && drag.docId && (
        <div
          className="fixed z-50 pointer-events-none rounded-lg bg-white shadow-lg border border-[var(--brand-light)] px-3 py-1.5 text-xs text-slate-700 flex items-center gap-1.5"
          style={{ left: drag.x + 12, top: drag.y + 12, opacity: 0.95 }}
        >
          <IconFile size={13} /> {drag.title}
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
        title="新建"
        className="w-7 h-7 rounded-md bg-[var(--brand)] text-white flex items-center justify-center hover:bg-[var(--brand-hover)]"
      >
        <IconPlus size={15} />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-32 rounded-lg bg-white shadow-lg border border-[var(--border-light)] py-1 z-20 text-xs">
          <button
            onClick={() => { setOpen(false); onCreate('doc'); }}
            className="w-full text-left px-3 py-1.5 hover:bg-[var(--bg-2)] flex items-center gap-2 text-[var(--text-1)]"
          >
            <IconFile size={14} className="text-[var(--text-2)]" /> 文档
          </button>
          <button
            onClick={() => { setOpen(false); onCreate('folder'); }}
            className="w-full text-left px-3 py-1.5 hover:bg-[var(--bg-2)] flex items-center gap-2 text-[var(--text-1)]"
          >
            <IconFolder size={14} className="text-[var(--text-2)]" /> 文件夹
          </button>
          <button
            onClick={() => { setOpen(false); fileRef.current?.click(); }}
            className="w-full text-left px-3 py-1.5 hover:bg-[var(--bg-2)] flex items-center gap-2 text-[var(--text-1)]"
          >
            <IconImport size={14} className="text-[var(--text-2)]" /> 导入文件
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
        className="w-5 h-5 rounded text-[var(--text-3)] hover:text-[var(--brand)] hover:bg-[var(--bg-2)] flex items-center justify-center"
      >
        <IconPlus size={13} />
      </button>
      {open && (
        <div className="absolute left-0 mt-1 w-28 rounded-lg bg-white shadow-lg border border-[var(--border-light)] py-1 z-20 text-xs">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onCreate('doc');
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-[var(--bg-2)] flex items-center gap-2 text-[var(--text-1)]"
          >
            <IconFile size={13} className="text-[var(--text-2)]" /> 文档
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onCreate('folder');
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-[var(--bg-2)] flex items-center gap-2 text-[var(--text-1)]"
          >
            <IconFolder size={13} className="text-[var(--text-2)]" /> 子文件夹
          </button>
        </div>
      )}
    </div>
  );
}

interface TreeHandlers {
  onSelectFolder: (id: string) => void;
  onSelectDoc: (id: string) => void;
  onRefresh: () => void;
  onStartCreate: (type: 'folder' | 'doc', parentId: string | null) => void;
  onMoveDoc: (docId: string, folderId: string | null) => void;
  onCancelCreate: () => void;
  onFinishCreate: (name: string) => Promise<void>;
  onRenameFolder: (f: DocFolder) => void;
  onDeleteFolder: (f: DocFolder) => void;
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
  onRenameFolder,
  onDeleteFolder,
  onDrill,
}: {
  folders: DocFolder[];
  docs: Document[];
  selectedFolderId: string | null;
  selectedDocId: string | null;
  creating: { type: 'folder' | 'doc'; parentId: string | null } | null;
  refreshKey: number;
} & TreeHandlers & { onDrill: (id: string) => void }) {
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
          onRenameFolder={onRenameFolder}
          onDeleteFolder={onDeleteFolder}
          onDrill={onDrill}
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

// M40：钻取视图——只渲染当前文件夹的直接子级（子文件夹 + 文档），可继续双击下钻
function DrilledTree({
  folders,
  folderId,
  selectedFolderId,
  selectedDocId,
  creating,
  onSelectFolder,
  onSelectDoc,
  onDrill,
  onRefresh,
  onStartCreate,
  onMoveDoc,
  onCancelCreate,
  onFinishCreate,
  onRenameFolder,
  onDeleteFolder,
}: {
  folders: DocFolder[];
  folderId: string;
  selectedFolderId: string | null;
  selectedDocId: string | null;
  creating: { type: 'folder' | 'doc'; parentId: string | null } | null;
} & TreeHandlers & { onDrill: (id: string) => void }) {
  const [children, setChildren] = useState<{ folders: DocFolder[]; docs: Document[] } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setChildren(null);
    setError(false);
    api
      .folderContents(folderId)
      .then((res) => {
        if (active) setChildren({ folders: res.folders, docs: res.docs as Document[] });
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [folderId]);

  const subFolders = useMemo(
    () => (children ? children.folders : folders.filter((f) => f.parent_id === folderId)),
    [children, folders, folderId],
  );

  return (
    <div className="px-2 space-y-0.5 min-h-full" data-tree-root>
      {error && <div className="text-xs text-[var(--danger)] px-2 py-1.5">加载失败</div>}
      {!children && !error && <div className="text-xs text-[var(--text-3)] px-2 py-1.5">加载中…</div>}
      {subFolders.map((f) => (
        <FolderTreeNode
          key={f.id}
          folder={f}
          selectedFolderId={selectedFolderId}
          selectedDocId={selectedDocId}
          creating={creating}
          refreshKey={0}
          onSelectFolder={onSelectFolder}
          onSelectDoc={onSelectDoc}
          onRefresh={onRefresh}
          onStartCreate={onStartCreate}
          onMoveDoc={onMoveDoc}
          onCancelCreate={onCancelCreate}
          onFinishCreate={onFinishCreate}
          onRenameFolder={onRenameFolder}
          onDeleteFolder={onDeleteFolder}
          onDrill={onDrill}
        />
      ))}
      {children?.docs.map((d) => (
        <DocTreeNode key={d.id} doc={d} selectedDocId={selectedDocId} onSelect={onSelectDoc} onMoveDoc={onMoveDoc} />
      ))}
      {creating && creating.parentId === folderId && (
        <InlineCreator type={creating.type} onCancel={onCancelCreate} onFinish={onFinishCreate} />
      )}
      {children && children.folders.length === 0 && children.docs.length === 0 && !creating && (
        <div className="text-xs text-[var(--text-3)] px-2 py-1.5">空文件夹</div>
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
  onRenameFolder,
  onDeleteFolder,
  onDrill,
}: {
  folder: DocFolder;
  selectedFolderId: string | null;
  selectedDocId: string | null;
  creating: { type: 'folder' | 'doc'; parentId: string | null } | null;
  refreshKey: number;
} & TreeHandlers & { onDrill?: (id: string) => void }) {
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
    if (expanded && refreshKey) void reloadChildren();
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

  return (
    <div>
      <div
        data-folder-id={folder.id}
        className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 cursor-pointer text-sm ${
          dragHover === folder.id
            ? 'bg-[var(--brand-light)] ring-1 ring-[var(--brand)] text-[var(--brand)]'
            : selectedFolderId === folder.id
              ? 'bg-[var(--brand-light)] text-[var(--brand)]'
              : 'text-[var(--text-1)] hover:bg-[var(--bg-2)]'
        }`}
        onClick={(e) => {
          if (e.detail > 1) return; // 双击的第二击不重复触发选中
          onSelectFolder(folder.id);
        }}
        onDoubleClick={() => onDrill?.(folder.id)}
        title="单击选中 · 双击进入文件夹"
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            void toggle();
          }}
          className={`w-4 shrink-0 text-[var(--text-3)] transition-transform duration-150 ${expanded ? '' : '-rotate-90'}`}
          title={expanded ? '收起' : '展开'}
        >
          <IconChevronRight size={12} />
        </button>
        <span className="text-[var(--text-2)] shrink-0">
          {expanded ? <IconFolderOpen size={15} /> : <IconFolder size={15} />}
        </span>
        <span className="flex-1 truncate font-medium">{folder.name}</span>
        <div className="hidden group-hover:flex items-center gap-0.5">
          <NodeCreateMenu onCreate={(type) => void startCreateHere(type)} />
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRenameFolder(folder);
            }}
            title="重命名"
            className="w-5 h-5 rounded text-[var(--text-3)] hover:text-[var(--brand)] hover:bg-[var(--bg-2)] flex items-center justify-center"
          >
            <IconPencil size={12} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeleteFolder(folder);
            }}
            title="删除"
            className="w-5 h-5 rounded text-[var(--text-3)] hover:text-[var(--danger)] hover:bg-[var(--bg-2)] flex items-center justify-center"
          >
            <IconTrash size={12} />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="pl-4 border-l border-[var(--border-light)] ml-3 mt-0.5 space-y-0.5">
          {loading && <div className="text-xs text-[var(--text-3)] py-1">加载中…</div>}
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
              onRenameFolder={onRenameFolder}
              onDeleteFolder={onDeleteFolder}
              onDrill={onDrill}
            />
          ))}
          {children?.docs.map((d) => (
            <DocTreeNode key={d.id} doc={d} selectedDocId={selectedDocId} onSelect={onSelectDoc} onMoveDoc={onMoveDoc} />
          ))}
          {creating && creating.parentId === folder.id && (
            <InlineCreator type={creating.type} onCancel={onCancelCreate} onFinish={onFinishCreate} />
          )}
          {children && children.folders.length === 0 && children.docs.length === 0 && !creating && (
            <div className="text-xs text-[var(--text-3)] py-1">空</div>
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
        selectedDocId === doc.id ? 'bg-[var(--brand-light)] text-[var(--brand)]' : 'text-[var(--text-2)] hover:bg-[var(--bg-2)]'
      }`}
    >
      <span className="shrink-0">{doc.clip_id ? <IconImport size={15} /> : <IconFile size={15} />}</span>
      <span className="flex-1 truncate">{doc.title || '未命名'}</span>
    </div>
  );
}

function FolderDetails({
  folders,
  folderId,
  onEnterFolder,
  onEnterRoot,
  onSelectDoc,
  onOrganize,
  onRefresh,
}: {
  folders: DocFolder[];
  folderId: string;
  onEnterFolder: (id: string) => void;
  onEnterRoot: () => void;
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
      <header className="px-4 py-3 border-b border-[var(--border-light)] flex items-center justify-between gap-3">
        <div className="flex items-center gap-1 text-sm text-[var(--text-2)] min-w-0">
          <button onClick={onEnterRoot} className="text-[var(--text-3)] hover:text-[var(--brand)]">
            根目录
          </button>
          {path.map((p) => (
            <span key={p.id} className="flex items-center gap-1 min-w-0">
              <span className="text-[var(--text-4)]">/</span>
              <button
                onClick={() => onEnterFolder(p.id)}
                className={`truncate hover:text-[var(--brand)] ${p.id === folderId ? 'font-medium text-[var(--text-1)]' : ''}`}
              >
                {p.name}
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onOrganize}
            className="text-xs rounded-md bg-[rgba(127,59,245,0.08)] text-[#7F3BF5] px-2.5 py-1.5 hover:bg-[rgba(127,59,245,0.14)] flex items-center gap-1"
          >
            <IconSparkles size={13} /> AI 整理
          </button>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto py-2">
        {loading ? (
          <div className="h-40 flex items-center justify-center text-[var(--text-3)] text-sm">加载中…</div>
        ) : data && data.folders.length === 0 && data.docs.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center text-[var(--text-3)] text-sm">
            <IconFolder size={36} className="text-[var(--text-4)] mb-2" />
            当前文件夹为空
          </div>
        ) : (
          <>
            {data?.folders.map((f) => (
              <div
                key={f.id}
                onClick={() => onEnterFolder(f.id)}
                className="mx-3 mb-1 rounded-lg px-3 py-2 cursor-pointer flex items-center gap-2.5 text-[var(--text-1)] hover:bg-[var(--bg-2)] border border-transparent hover:border-[var(--border-light)]"
              >
                <span className="w-7 h-7 rounded-md bg-[var(--brand-light)] text-[var(--brand)] flex items-center justify-center shrink-0">
                  <IconFolder size={15} />
                </span>
                <span className="text-sm font-medium">{f.name}</span>
              </div>
            ))}
            {data?.docs.map((d) => (
              <div
                key={d.id}
                onClick={() => onSelectDoc(d.id)}
                className="mx-3 mb-1 rounded-lg px-3 py-2 cursor-pointer flex items-start gap-2.5 text-[var(--text-2)] hover:bg-[var(--bg-2)] border border-transparent hover:border-[var(--border-light)]"
              >
                <span className="w-7 h-7 rounded-md bg-[var(--bg-2)] text-[var(--text-2)] flex items-center justify-center shrink-0">
                  {d.clip_id ? <IconImport size={15} /> : <IconFile size={15} />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate text-[var(--text-1)]">{d.title || '未命名'}</p>
                  {d.summary && <p className="text-[10px] text-[var(--text-3)] truncate mt-0.5">{d.summary}</p>}
                  <p className="text-[10px] text-[var(--text-3)] mt-0.5 flex items-center gap-2">
                    <span>{formatTime(d.updated_at)}</span>
                    {d.tags && <span className="text-[var(--text-4)] truncate">{d.tags}</span>}
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
      <header className="px-4 py-3 border-b border-[var(--border-light)] flex items-center justify-between">
        <h3 className="font-semibold text-sm text-[var(--text-1)]">根目录</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={onOrganize}
            className="text-xs rounded-md bg-[rgba(127,59,245,0.08)] text-[#7F3BF5] px-2.5 py-1.5 hover:bg-[rgba(127,59,245,0.14)] flex items-center gap-1"
          >
            <IconSparkles size={13} /> AI 整理
          </button>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto py-2">
        {folders.filter((f) => f.parent_id === null).map((f) => (
          <div
            key={f.id}
            onClick={() => onSelectFolder(f.id)}
            className="mx-3 mb-1 rounded-lg px-3 py-2 cursor-pointer flex items-center gap-2.5 text-[var(--text-1)] hover:bg-[var(--bg-2)] border border-transparent hover:border-[var(--border-light)]"
          >
            <span className="w-7 h-7 rounded-md bg-[var(--brand-light)] text-[var(--brand)] flex items-center justify-center shrink-0">
              <IconFolder size={15} />
            </span>
            <span className="text-sm font-medium">{f.name}</span>
          </div>
        ))}
        {docs.map((d) => (
          <div
            key={d.id}
            onClick={() => onSelectDoc(d.id)}
            className="mx-3 mb-1 rounded-lg px-3 py-2 cursor-pointer flex items-start gap-2.5 text-[var(--text-2)] hover:bg-[var(--bg-2)] border border-transparent hover:border-[var(--border-light)]"
          >
            <span className="w-7 h-7 rounded-md bg-[var(--bg-2)] text-[var(--text-2)] flex items-center justify-center shrink-0">
              {d.clip_id ? <IconImport size={15} /> : <IconFile size={15} />}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate text-[var(--text-1)]">{d.title || '未命名'}</p>
              {d.summary && <p className="text-[10px] text-[var(--text-3)] truncate mt-0.5">{d.summary}</p>}
              <p className="text-[10px] text-[var(--text-3)] mt-0.5 flex items-center gap-2">
                <span>{formatTime(d.updated_at)}</span>
                {d.tags && <span className="text-[var(--text-4)] truncate">{d.tags}</span>}
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
  const { guard: imeGuard, compositionProps: imeProps } = useImeGuard();

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = async () => {
    await onFinish(name);
  };

  return (
    <div className="flex items-center gap-1 rounded-lg px-2 py-1.5 bg-[var(--brand-light)] border border-[var(--brand)]">
      <span className="text-[var(--brand)] shrink-0">{type === 'folder' ? <IconFolder size={14} /> : <IconFile size={14} />}</span>
      <input
        ref={inputRef}
        className="flex-1 text-sm bg-transparent focus:outline-none text-[var(--text-1)]"
        value={name}
        onChange={(e) => setName(e.target.value)}
        {...imeProps}
        onKeyDown={(e) => {
          if (imeGuard(e)) return;
          if (e.key === 'Enter') void submit();
          if (e.key === 'Escape') onCancel();
        }}
        onBlur={() => onCancel()}
      />
    </div>
  );
}

/** M40：单行输入弹窗（重命名等，替代 window.prompt） */
function InputModal({
  title,
  initialValue,
  onCancel,
  onSubmit,
}: {
  title: string;
  initialValue: string;
  onCancel: () => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const { guard: imeGuard, compositionProps: imeProps } = useImeGuard();

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="w-80 bg-white rounded-xl shadow-xl p-4">
        <h3 className="font-semibold text-sm text-[var(--text-1)] mb-3">{title}</h3>
        <input
          ref={inputRef}
          className="w-full h-9 border border-[var(--border)] rounded-md px-3 text-sm text-[var(--text-1)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[rgba(51,112,255,0.15)]"
          value={name}
          onChange={(e) => setName(e.target.value)}
          {...imeProps}
          onKeyDown={(e) => {
            if (imeGuard(e)) return;
            if (e.key === 'Enter') onSubmit(name);
            if (e.key === 'Escape') onCancel();
          }}
        />
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onCancel}
            className="h-7 px-3 text-xs rounded-md border border-[var(--border)] text-[var(--text-1)] hover:bg-[var(--bg-2)]"
          >
            取消
          </button>
          <button
            onClick={() => onSubmit(name)}
            className="h-7 px-3 text-xs rounded-md bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)]"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}

/** M40：确认弹窗（删除等，替代 window.confirm） */
function ConfirmModal({
  title,
  body,
  confirmText,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmText: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="w-80 bg-white rounded-xl shadow-xl p-4">
        <h3 className="font-semibold text-sm text-[var(--text-1)] mb-2">{title}</h3>
        <p className="text-xs text-[var(--text-2)] leading-relaxed">{body}</p>
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onCancel}
            className="h-7 px-3 text-xs rounded-md border border-[var(--border)] text-[var(--text-1)] hover:bg-[var(--bg-2)]"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="h-7 px-3 text-xs rounded-md bg-[var(--danger)] text-white hover:opacity-90"
          >
            {confirmText}
          </button>
        </div>
      </div>
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
        <header className="px-5 py-4 border-b border-[var(--border-light)] flex items-center justify-between">
          <h3 className="font-semibold text-sm text-[var(--text-1)] flex items-center gap-1.5">
            <IconSparkles size={14} className="text-[#7F3BF5]" /> AI 整理归档预览
          </h3>
          <button onClick={onClose} className="w-6 h-6 rounded text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--bg-2)] flex items-center justify-center">
            <IconClose size={14} />
          </button>
        </header>

        {loading ? (
          <div className="p-10 text-center text-sm text-[var(--text-3)]">AI 分析中…</div>
        ) : (
          <>
            <div className="flex-1 overflow-hidden flex">
              <div className="w-1/3 border-r border-[var(--border-light)] p-3 overflow-y-auto">
                <p className="text-xs text-[var(--text-3)] mb-2">建议文件夹</p>
                {allNames.map((name) => (
                  <div key={name} className="flex items-center gap-2 text-sm text-[var(--text-1)] py-1">
                    <IconFolder size={14} className="text-[var(--brand)] shrink-0" />
                    <span className="truncate">{name}</span>
                  </div>
                ))}
                {allNames.length === 0 && <p className="text-xs text-[var(--text-3)]">无需整理</p>}
              </div>
              <div className="flex-1 p-3 overflow-y-auto">
                <p className="text-xs text-[var(--text-3)] mb-2">待归档文档</p>
                <div className="space-y-2">
                  {docs.map((d) => (
                    <div key={d.id} className="rounded-lg border border-[var(--border-light)] p-2.5">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-sm text-[var(--text-1)] truncate">{d.title}</span>
                        <select
                          value={docToFolder[d.id] ?? ''}
                          onChange={(e) => updateDocFolder(d.id, e.target.value)}
                          className="text-xs border border-[var(--border)] rounded-md px-2 py-1 bg-white"
                        >
                          <option value="">不移动</option>
                          {allNames.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                      </div>
                      {d.summary && <p className="text-[10px] text-[var(--text-3)] truncate">{d.summary}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <footer className="px-5 py-3 border-t border-[var(--border-light)] flex justify-end gap-2">
              <button onClick={onClose} className="text-xs rounded-md bg-[var(--bg-2)] text-[var(--text-2)] px-3 py-1.5 hover:bg-[var(--bg-1)]">
                取消
              </button>
              <button
                onClick={apply}
                className="text-xs rounded-md bg-[#7F3BF5] text-white px-3 py-1.5 hover:opacity-90"
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
