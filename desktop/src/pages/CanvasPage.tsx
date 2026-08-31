import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type CanvasBoard, type CanvasBoardWithItems, type CanvasItem } from '../api/client';

export default function CanvasPage() {
  const [boards, setBoards] = useState<CanvasBoard[]>([]);
  const [currentBoard, setCurrentBoard] = useState<CanvasBoardWithItems | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadBoards = useCallback(async () => {
    try {
      setBoards(await api.listCanvasBoards());
      setError('');
    } catch (e) {
      setError(`加载失败：${(e as Error).message}`);
    }
  }, []);

  const loadBoard = useCallback(async (id: string) => {
    setLoading(true);
    try {
      setCurrentBoard(await api.getCanvasBoard(id));
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBoards();
  }, [loadBoards]);

  const createBoard = async () => {
    const title = window.prompt('新建画布名称');
    if (!title?.trim()) return;
    try {
      const board = await api.createCanvasBoard(title.trim());
      await loadBoards();
      await loadBoard(board.id);
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const deleteBoard = async (id: string) => {
    if (!confirm('确认删除该画布？')) return;
    try {
      await api.deleteCanvasBoard(id);
      if (currentBoard?.id === id) setCurrentBoard(null);
      await loadBoards();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <div className="h-full flex bg-slate-50">
      {/* 左侧画布列表 */}
      <aside className="w-56 shrink-0 bg-white border-r border-slate-200 flex flex-col">
        <header className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold text-sm">调研画布</h2>
          <button
            onClick={createBoard}
            className="text-xs rounded-md bg-indigo-600 text-white px-2.5 py-1.5 hover:bg-indigo-700"
          >
            新建
          </button>
        </header>
        {error && <div className="px-3 py-2 text-xs text-red-500 bg-red-50">{error}</div>}
        <div className="flex-1 overflow-y-auto py-2">
          {boards.map((b) => (
            <div
              key={b.id}
              onClick={() => loadBoard(b.id)}
              className={`mx-2 mb-1 rounded-lg px-3 py-2 cursor-pointer flex items-center justify-between ${
                currentBoard?.id === b.id
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span className="text-sm truncate">{b.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteBoard(b.id);
                }}
                className="text-xs text-slate-400 hover:text-red-500"
              >
                🗑
              </button>
            </div>
          ))}
          {!boards.length && !error && (
            <p className="text-xs text-slate-400 text-center pt-10">暂无画布，点击右上角新建</p>
          )}
        </div>
      </aside>

      {/* 主画布区 */}
      <main className="flex-1 min-w-0 relative overflow-hidden">
        {loading ? (
          <div className="h-full flex items-center justify-center text-slate-400">加载中…</div>
        ) : currentBoard ? (
          <CanvasBoard board={currentBoard} onRefresh={() => loadBoard(currentBoard.id)} />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-300">
            <div className="text-5xl mb-4">🎨</div>
            <p className="text-sm">选择或新建一个画布开始调研</p>
          </div>
        )}
      </main>
    </div>
  );
}

function CanvasBoard({ board, onRefresh }: { board: CanvasBoardWithItems; onRefresh: () => void }) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [draggingItem, setDraggingItem] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempContent, setTempContent] = useState('');

  const createItem = async (x: number, y: number, type: 'text' | 'image' | 'clip' = 'text') => {
    const worldX = (x - pan.x) / scale;
    const worldY = (y - pan.y) / scale;
    try {
      await api.createCanvasItem(board.id, {
        type,
        x: worldX,
        y: worldY,
        w: type === 'image' ? 280 : 240,
        h: type === 'image' ? 200 : 160,
      });
      onRefresh();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const updateItem = async (id: string, patch: Partial<CanvasItem>) => {
    try {
      await api.updateCanvasItem(id, patch);
      onRefresh();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const deleteItem = async (id: string) => {
    try {
      await api.deleteCanvasItem(id);
      onRefresh();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    createItem(e.clientX - rect.left, e.clientY - rect.top);
  };

  const onMouseDown = (e: React.MouseEvent, item: CanvasItem) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const rect = canvasRef.current!.getBoundingClientRect();
    const worldX = (e.clientX - rect.left - pan.x) / scale;
    const worldY = (e.clientY - rect.top - pan.y) / scale;
    setDraggingItem(item.id);
    setDragOffset({ x: worldX - item.x, y: worldY - item.y });
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!draggingItem) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const worldX = (e.clientX - rect.left - pan.x) / scale;
    const worldY = (e.clientY - rect.top - pan.y) / scale;
    updateItem(draggingItem, { x: worldX - dragOffset.x, y: worldY - dragOffset.y });
  };

  const onMouseUp = () => {
    setDraggingItem(null);
  };

  const startEdit = (item: CanvasItem) => {
    setEditingId(item.id);
    setTempContent(item.content);
  };

  const saveEdit = async (id: string) => {
    await updateItem(id, { content: tempContent });
    setEditingId(null);
  };

  const zoom = (delta: number) => {
    setScale((s) => Math.min(2, Math.max(0.3, s + delta)));
  };

  return (
    <div className="h-full flex flex-col">
      {/* 工具栏 */}
      <div className="h-10 bg-white border-b border-slate-200 flex items-center px-4 gap-3 text-xs">
        <span className="text-slate-500">{board.title}</span>
        <button onClick={() => zoom(0.1)} className="rounded bg-slate-100 px-2 py-1 hover:bg-slate-200">
          放大
        </button>
        <button onClick={() => zoom(-0.1)} className="rounded bg-slate-100 px-2 py-1 hover:bg-slate-200">
          缩小
        </button>
        <span className="text-slate-400">{Math.round(scale * 100)}%</span>
        <span className="flex-1" />
        <span className="text-slate-400">双击空白处创建卡片，拖拽移动，双击卡片编辑</span>
      </div>

      {/* 画布 */}
      <div
        ref={canvasRef}
        className="flex-1 relative overflow-hidden bg-slate-100 cursor-default"
        style={{
          backgroundImage: 'radial-gradient(circle, #cbd5e1 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
        onDoubleClick={onDoubleClick}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <div
          className="absolute inset-0"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
        >
          {board.items.map((item) => (
            <div
              key={item.id}
              className="absolute rounded-xl bg-white shadow-md border border-slate-200 overflow-hidden group"
              style={{
                left: item.x,
                top: item.y,
                width: item.w,
                height: item.h,
                cursor: draggingItem === item.id ? 'grabbing' : 'grab',
              }}
              onMouseDown={(e) => onMouseDown(e, item)}
            >
              {item.type === 'image' ? (
                item.content ? (
                  <img
                    src={item.content}
                    alt=""
                    className="w-full h-full object-cover pointer-events-none"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-300 text-2xl">
                    🖼️
                  </div>
                )
              ) : editingId === item.id ? (
                <textarea
                  autoFocus
                  className="w-full h-full p-3 text-xs focus:outline-none resize-none"
                  value={tempContent}
                  onChange={(e) => setTempContent(e.target.value)}
                  onBlur={() => saveEdit(item.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.ctrlKey) saveEdit(item.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                />
              ) : (
                <div
                  className="w-full h-full p-3 text-xs text-slate-700 whitespace-pre-wrap overflow-hidden"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    startEdit(item);
                  }}
                >
                  {item.content || '双击编辑…'}
                </div>
              )}

              {/* 工具按钮 */}
              <div className="absolute top-1 right-1 hidden group-hover:flex gap-1">
                {item.type !== 'image' && editingId !== item.id && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      startEdit(item);
                    }}
                    className="w-6 h-6 rounded bg-white/80 text-xs hover:bg-white"
                    title="编辑"
                  >
                    ✎
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteItem(item.id);
                  }}
                  className="w-6 h-6 rounded bg-white/80 text-xs hover:bg-white text-red-400"
                  title="删除"
                >
                  🗑
                </button>
              </div>

              {/* 来源链接 */}
              {item.source_url && (
                <a
                  href={item.source_url}
                  target="_blank"
                  rel="noopener"
                  className="absolute bottom-1 left-1 text-[10px] text-indigo-400 hover:underline bg-white/80 rounded px-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  来源
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
