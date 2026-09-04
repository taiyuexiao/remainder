import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type CanvasBoard, type CanvasBoardWithItems, type CanvasItem } from '../api/client';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { FontFamily } from '@tiptap/extension-font-family';
import { Extension } from '@tiptap/core';

/** 字号支持：给 textStyle 标记加 fontSize 属性（工具栏用 setMark 设置） */
const FontSizeAttr = Extension.create({
  name: 'fontSizeAttr',
  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (el: HTMLElement) => el.style.fontSize || null,
            renderHTML: (attrs: Record<string, string | null>) =>
              attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {},
          },
        },
      },
    ];
  },
});

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 旧纯文本内容 → HTML 段落；已是 HTML 的原样返回 */
const toHtml = (content: string) => {
  const s = content.trimStart();
  if (s.startsWith('<')) return content;
  return content.split('\n').map((line) => `<p>${escapeHtml(line) || '<br>'}</p>`).join('');
};

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
  const [items, setItems] = useState<CanvasItem[]>(board.items);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [draggingItem, setDraggingItem] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  // 卡片角标拉伸：记录起始鼠标位置与原始宽高
  const resizeRef = useRef<{ id: string; startX: number; startY: number; w: number; h: number } | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    setItems(board.items);
  }, [board.items]);

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
    if (editingId === item.id) return;
    e.stopPropagation();
    const rect = canvasRef.current!.getBoundingClientRect();
    const worldX = (e.clientX - rect.left - pan.x) / scale;
    const worldY = (e.clientY - rect.top - pan.y) / scale;
    setDraggingItem(item.id);
    setDragOffset({ x: worldX - item.x, y: worldY - item.y });
  };

  // 空白处按住左键拖动 = 平移整个画布（卡片上的 mousedown 已 stopPropagation）
  const onCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    setPanning(true);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (resizingId && resizeRef.current) {
      const r = resizeRef.current;
      const dw = (e.clientX - r.startX) / scale;
      const dh = (e.clientY - r.startY) / scale;
      setItems((prev) =>
        prev.map((it) =>
          it.id === r.id
            ? { ...it, w: Math.max(160, r.w + dw), h: Math.max(90, r.h + dh) }
            : it,
        ),
      );
      return;
    }
    if (panning) {
      setPan({
        x: panStart.current.panX + (e.clientX - panStart.current.x),
        y: panStart.current.panY + (e.clientY - panStart.current.y),
      });
      return;
    }
    if (!draggingItem) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const worldX = (e.clientX - rect.left - pan.x) / scale;
    const worldY = (e.clientY - rect.top - pan.y) / scale;
    setItems((prev) =>
      prev.map((it) =>
        it.id === draggingItem ? { ...it, x: worldX - dragOffset.x, y: worldY - dragOffset.y } : it,
      ),
    );
  };

  const onMouseUp = async () => {
    setPanning(false);
    if (resizingId && resizeRef.current) {
      const item = items.find((it) => it.id === resizingId);
      if (item) {
        try {
          await api.updateCanvasItem(resizingId, { w: Math.round(item.w), h: Math.round(item.h) });
        } catch (e) {
          alert((e as Error).message);
        }
      }
      resizeRef.current = null;
      setResizingId(null);
      return;
    }
    if (draggingItem) {
      const item = items.find((it) => it.id === draggingItem);
      if (item) {
        try {
          await api.updateCanvasItem(draggingItem, { x: item.x, y: item.y });
        } catch (e) {
          alert((e as Error).message);
        }
      }
    }
    setDraggingItem(null);
  };

  const startEdit = (item: CanvasItem) => {
    setEditingId(item.id);
  };

  const saveEdit = async (id: string, html: string) => {
    await updateItem(id, { content: html });
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
        <span className="text-slate-400">按住空白处拖动平移画布，双击空白创建卡片，拖拽移动卡片，双击卡片编辑</span>
      </div>

      {/* 画布 */}
      <div
        ref={canvasRef}
        className={`flex-1 relative overflow-hidden bg-slate-100 ${panning ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{
          backgroundImage: 'radial-gradient(circle, #cbd5e1 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          // 网点随平移移动，有视差感
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
        onMouseDown={onCanvasMouseDown}
        onDoubleClick={onDoubleClick}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <div
          className="absolute inset-0"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
        >
          {items.map((item) => (
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
                <CardRichEditor
                  initial={item.content}
                  onSave={(html) => void saveEdit(item.id, html)}
                  onCancel={() => setEditingId(null)}
                />
              ) : item.content.trimStart().startsWith('<') ? (
                <div
                  className="card-rich w-full h-full p-3 text-xs text-slate-700 overflow-hidden"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    startEdit(item);
                  }}
                  dangerouslySetInnerHTML={{ __html: item.content }}
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

              {/* 拉伸角标：右下角拖拽调整宽高 */}
              {editingId !== item.id && (
                <div
                  className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize opacity-0 group-hover:opacity-70"
                  style={{
                    background: 'linear-gradient(135deg, transparent 50%, #94a3b8 50%)',
                    borderBottomRightRadius: '0.65rem',
                  }}
                  title="拖拽调整大小"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    resizeRef.current = { id: item.id, startX: e.clientX, startY: e.clientY, w: item.w, h: item.h };
                    setResizingId(item.id);
                  }}
                />
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


/* ============ 卡片富文本编辑器（Tiptap） ============ */

const FONT_FAMILIES: [string, string][] = [
  ['默认字体', ''],
  ['宋体', '宋体, SimSun, serif'],
  ['楷体', '楷体, KaiTi, serif'],
  ['黑体', '黑体, SimHei, sans-serif'],
  ['等宽', 'Consolas, monospace'],
];

const FONT_SIZES: [string, string][] = [
  ['默认', ''],
  ['12px', '12px'],
  ['14px', '14px'],
  ['16px', '16px'],
  ['20px', '20px'],
  ['24px', '24px'],
  ['32px', '32px'],
];

function CardToolbar({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  // 按钮 onMouseDown preventDefault：保持编辑器选区不丢失
  const hold = (e: React.MouseEvent) => e.preventDefault();
  const btn = (active: boolean) =>
    `px-1.5 py-0.5 rounded text-[11px] ${active ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-slate-100 text-slate-600'}`;

  return (
    <div className="flex items-center gap-1 flex-wrap px-1.5 py-1 border-b border-slate-100 bg-slate-50/80 shrink-0">
      <select
        className="text-[11px] bg-transparent outline-none max-w-[70px]"
        title="字体"
        onMouseDown={hold}
        value={editor.getAttributes('textStyle').fontFamily ?? ''}
        onChange={(e) => {
          const v = e.target.value;
          const chain = editor.chain().focus();
          if (v) chain.setFontFamily(v).run();
          else chain.unsetFontFamily().run();
        }}
      >
        {FONT_FAMILIES.map(([label, v]) => (
          <option key={label} value={v}>{label}</option>
        ))}
      </select>
      <select
        className="text-[11px] bg-transparent outline-none"
        title="字号"
        onMouseDown={hold}
        value={editor.getAttributes('textStyle').fontSize ?? ''}
        onChange={(e) => {
          const v = e.target.value;
          const chain = editor.chain().focus();
          if (v) chain.setMark('textStyle', { fontSize: v }).run();
          else chain.setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run();
        }}
      >
        {FONT_SIZES.map(([label, v]) => (
          <option key={label} value={v}>{label}</option>
        ))}
      </select>
      <button onMouseDown={hold} onClick={() => editor.chain().focus().toggleBold().run()} className={btn(editor.isActive('bold'))} title="加粗">
        <b>B</b>
      </button>
      <button onMouseDown={hold} onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(editor.isActive('italic'))} title="倾斜">
        <i>I</i>
      </button>
      <label className="flex items-center gap-0.5 text-[11px] text-slate-500 cursor-pointer" title="字体颜色" onMouseDown={hold}>
        <span style={{ color: editor.getAttributes('textStyle').color || '#334155' }}>A</span>
        <input
          type="color"
          className="w-4 h-4 p-0 border-0 bg-transparent cursor-pointer"
          value={editor.getAttributes('textStyle').color || '#334155'}
          onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
        />
      </label>
      <label className="flex items-center gap-0.5 text-[11px] text-slate-500 cursor-pointer" title="高亮背景" onMouseDown={hold}>
        <span className="px-0.5 rounded" style={{ background: '#fef08a' }}>A</span>
        <input
          type="color"
          className="w-4 h-4 p-0 border-0 bg-transparent cursor-pointer"
          defaultValue="#fef08a"
          onChange={(e) => editor.chain().focus().setHighlight({ color: e.target.value }).run()}
        />
      </label>
      <button onMouseDown={hold} onClick={() => editor.chain().focus().unsetHighlight().run()} className={btn(false)} title="取消高亮">
        🧽
      </button>
      <span className="flex-1" />
      <button onMouseDown={hold} onClick={onDone} className="px-1.5 py-0.5 rounded text-[11px] bg-indigo-500 text-white hover:bg-indigo-600" title="保存（Ctrl+Enter）">
        ✓ 完成
      </button>
    </div>
  );
}

function CardRichEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (html: string) => void;
  onCancel: () => void;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false }),
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
      FontFamily,
      FontSizeAttr,
    ],
    content: toHtml(initial),
    autofocus: 'end',
    editorProps: {
      attributes: {
        class: 'card-rich focus:outline-none p-3 text-xs text-slate-700 flex-1 overflow-y-auto',
      },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Escape') {
          onCancel();
          return true;
        }
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          onSave(editor?.getHTML() ?? '');
          return true;
        }
        return false;
      },
    },
  });

  if (!editor) return null;
  return (
    <div
      className="w-full h-full flex flex-col cursor-text"
      onMouseDown={(e) => e.stopPropagation()}
      onBlur={(e) => {
        // 点击工具栏不触发保存；真正点到卡片外才保存
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          onSave(editor.getHTML());
        }
      }}
    >
      <CardToolbar editor={editor} onDone={() => onSave(editor.getHTML())} />
      <EditorContent editor={editor} className="flex-1 overflow-y-auto" />
    </div>
  );
}
