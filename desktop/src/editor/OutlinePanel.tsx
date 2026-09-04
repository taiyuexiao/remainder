/**
 * 大纲目录侧栏（M21 飞书式）：按标题层级自动生成，点击跳转
 */
import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/core';

interface HeadingItem {
  level: number;
  text: string;
  pos: number;
}

export default function OutlinePanel({ editor, open }: { editor: Editor; open: boolean }) {
  const [headings, setHeadings] = useState<HeadingItem[]>([]);
  const [activePos, setActivePos] = useState(-1);

  useEffect(() => {
    const update = () => {
      const list: HeadingItem[] = [];
      editor.state.doc.forEach((node, offset) => {
        if (node.type.name === 'heading') {
          list.push({ level: node.attrs.level as number, text: node.textContent, pos: offset });
        }
      });
      setHeadings(list);
      setActivePos(editor.state.selection.$from.before(1));
    };
    update();
    editor.on('update', update);
    editor.on('selectionUpdate', update);
    return () => {
      editor.off('update', update);
      editor.off('selectionUpdate', update);
    };
  }, [editor]);

  if (!open) return null;

  return (
    <div className="absolute right-0 top-0 bottom-0 w-52 border-l border-slate-100 bg-white/95 backdrop-blur overflow-y-auto py-3 px-2 z-10">
      <p className="text-[10px] font-medium text-slate-400 px-2 pb-2">大纲</p>
      {headings.length === 0 && (
        <p className="text-[11px] text-slate-300 px-2">用「标题 1-3」组织内容后，目录会自动生成</p>
      )}
      {headings.map((h, i) => (
        <button
          key={i}
          onClick={() => {
            const { node } = editor.view.domAtPos(h.pos);
            (node as HTMLElement).scrollIntoView?.({ behavior: 'smooth', block: 'start' });
          }}
          className={`w-full text-left text-xs rounded-md px-2 py-1 truncate transition-colors ${
            activePos === h.pos ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'
          }`}
          style={{ paddingLeft: 8 + (h.level - 1) * 14 }}
          title={h.text}
        >
          {h.text || '（空标题）'}
        </button>
      ))}
    </div>
  );
}
