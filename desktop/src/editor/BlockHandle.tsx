/**
 * 块手柄（M21 飞书式 ⋮⋮/+）：
 * 鼠标悬停块时，左侧浮现手柄：
 *  - ➕ 在该块下方插入新段落
 *  - ⋮⋮ 点击打开块菜单（转换类型/上移/下移/复制/删除）
 *  - ⋮⋮ 按住拖动移动块（蓝色指示线显示落点）
 */
import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';

interface BlockPos {
  top: number;
  left: number;
  start: number; // 块起始 pos（nodeAt 位置）
  end: number;
  type: string;
}

const CONVERT_ITEMS: { label: string; run: (e: Editor) => void }[] = [
  { label: '正文', run: (e) => e.chain().focus().setParagraph().run() },
  { label: '标题 1', run: (e) => e.chain().focus().setNode('heading', { level: 1 }).run() },
  { label: '标题 2', run: (e) => e.chain().focus().setNode('heading', { level: 2 }).run() },
  { label: '标题 3', run: (e) => e.chain().focus().setNode('heading', { level: 3 }).run() },
  { label: '无序列表', run: (e) => e.chain().focus().toggleBulletList().run() },
  { label: '有序列表', run: (e) => e.chain().focus().toggleOrderedList().run() },
  { label: '任务列表', run: (e) => e.chain().focus().toggleTaskList().run() },
  { label: '引用', run: (e) => e.chain().focus().setBlockquote().run() },
  { label: '代码块', run: (e) => e.chain().focus().setCodeBlock().run() },
];

export default function BlockHandle({ editor }: { editor: Editor }) {
  const [block, setBlock] = useState<BlockPos | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragY, setDragY] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const container = (): HTMLElement | null => wrapRef.current?.parentElement ?? null;

  // 悬停跟踪：鼠标移动时定位所在顶层块
  useEffect(() => {
    const c = container();
    if (!c) return;
    const onMove = (e: MouseEvent) => {
      const pos = editor.view.posAtCoords({ left: e.clientX, top: e.clientY });
      if (!pos) return;
      const $pos = editor.state.doc.resolve(pos.pos);
      if ($pos.depth < 1) return;
      const start = $pos.before(1);
      const node = editor.state.doc.nodeAt(start);
      const dom = editor.view.nodeDOM(start) as HTMLElement | null;
      if (!node || !dom) return;
      const cRect = c.getBoundingClientRect();
      const bRect = dom.getBoundingClientRect();
      setBlock({
        top: bRect.top - cRect.top,
        left: bRect.left - cRect.left - 56,
        start,
        end: start + node.nodeSize,
        type: node.type.name,
      });
    };
    c.addEventListener('mousemove', onMove);
    return () => c.removeEventListener('mousemove', onMove);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // 菜单外点关闭
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  if (!block) return <div ref={wrapRef} />;

  // 选中块（把光标放进块内再执行命令）
  const selectBlock = () => {
    editor.chain().focus().setTextSelection({ from: block.start + 1, to: block.end - 1 }).run();
  };

  const insertBelow = () => {
    editor.chain().focus().insertContentAt(block.end, { type: 'paragraph' }).setTextSelection(block.end + 1).run();
  };

  const moveBlock = (dir: -1 | 1) => {
    const node = editor.state.doc.nodeAt(block.start)!;
    let target: number | null = null;
    if (dir === -1 && block.start > 0) {
      // 找前一个同级块
      editor.state.doc.forEach((n, off) => {
        if (off + n.nodeSize === block.start) target = off;
      });
    } else if (dir === 1) {
      const nextOff = block.end;
      const next = editor.state.doc.nodeAt(nextOff);
      if (next) target = nextOff + next.nodeSize;
    }
    if (target === null) return;
    const t: number = target;
    editor
      .chain()
      .focus()
      .deleteRange({ from: block.start, to: block.end })
      .insertContentAt(t > block.start ? t - node.nodeSize : t, node.toJSON())
      .run();
    setMenuOpen(false);
  };

  // ⋮⋮ 拖动移动块
  const onDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const c = container();
    if (!c) return;
    const movingNode = editor.state.doc.nodeAt(block.start)!;
    const fromStart = block.start;
    const fromEnd = block.end;
    let insertPos: number | null = null;

    const onMove = (ev: MouseEvent) => {
      const pos = editor.view.posAtCoords({ left: ev.clientX, top: ev.clientY });
      if (!pos) return;
      const $pos = editor.state.doc.resolve(pos.pos);
      if ($pos.depth < 1) return;
      const bStart = $pos.before(1);
      const dom = editor.view.nodeDOM(bStart) as HTMLElement | null;
      if (!dom) return;
      const cRect = c.getBoundingClientRect();
      const bRect = dom.getBoundingClientRect();
      const after = ev.clientY > bRect.top + bRect.height / 2;
      const nodeAt = editor.state.doc.nodeAt(bStart);
      insertPos = after ? bStart + (nodeAt?.nodeSize ?? 0) : bStart;
      setDragY((after ? bRect.bottom : bRect.top) - cRect.top);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setDragY(null);
      if (insertPos === null) return;
      const ip: number = insertPos;
      // 不允许落在自身区间
      if (ip >= fromStart && ip <= fromEnd) return;
      editor
        .chain()
        .focus()
        .deleteRange({ from: fromStart, to: fromEnd })
        .insertContentAt(ip > fromStart ? ip - movingNode.nodeSize : ip, movingNode.toJSON())
        .run();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div ref={wrapRef}>
      {/* 手柄本体 */}
      <div
        className="absolute z-20 flex items-center gap-0.5 select-none"
        style={{ top: block.top + 2, left: block.left }}
      >
        <button
          className="w-5 h-5 rounded flex items-center justify-center text-slate-300 hover:text-slate-500 hover:bg-slate-100 text-sm leading-none"
          title="在下方插入"
          onMouseDown={(e) => {
            e.preventDefault();
            insertBelow();
          }}
        >
          +
        </button>
        <button
          className="w-6 h-5 rounded flex items-center justify-center text-slate-300 hover:text-slate-500 hover:bg-slate-100 text-[10px] tracking-tight cursor-grab active:cursor-grabbing"
          title="点击打开块菜单，按住拖动移动块"
          onMouseDown={onDragStart}
          onClick={() => setMenuOpen((v) => !v)}
        >
          ⋮⋮
        </button>
      </div>

      {/* 拖动指示线 */}
      {dragY !== null && (
        <div className="absolute left-2 right-8 h-0.5 bg-indigo-500 rounded z-30 pointer-events-none" style={{ top: dragY - 1 }} />
      )}

      {/* 块菜单 */}
      {menuOpen && (
        <div
          ref={menuRef}
          className="absolute z-30 w-36 rounded-xl bg-white shadow-xl border border-slate-200 py-1 text-xs"
          style={{ top: block.top + 24, left: block.left }}
        >
          <div className="px-3 py-1 text-[10px] text-slate-400">转换为</div>
          {CONVERT_ITEMS.map((item) => (
            <button
              key={item.label}
              className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-slate-600"
              onClick={() => {
                selectBlock();
                item.run(editor);
                setMenuOpen(false);
              }}
            >
              {item.label}
            </button>
          ))}
          <div className="my-1 border-t border-slate-100" />
          <button className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-slate-600" onClick={() => moveBlock(-1)}>
            ↑ 上移
          </button>
          <button className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-slate-600" onClick={() => moveBlock(1)}>
            ↓ 下移
          </button>
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-slate-600"
            onClick={() => {
              const node = editor.state.doc.nodeAt(block.start)!;
              editor.chain().focus().insertContentAt(block.end, node.toJSON()).run();
              setMenuOpen(false);
            }}
          >
            ⧉ 复制
          </button>
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-red-50 text-red-500"
            onClick={() => {
              editor.chain().focus().deleteRange({ from: block.start, to: block.end }).run();
              setMenuOpen(false);
            }}
          >
            🗑 删除
          </button>
        </div>
      )}
    </div>
  );
}
