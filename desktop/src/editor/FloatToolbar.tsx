/**
 * 飞书式选中文本浮动工具栏（M15）：选中文字弹出
 * 层级 / 字体 / 字号 / 加粗 / 倾斜 / 字体颜色 / 高亮背景 / 链接
 */
import { BubbleMenu } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import { FONT_FAMILIES, FONT_SIZES } from './textStyle';
import { api } from '../api/client';
import { parseTableText, rowsToTableHtml } from './tableDetect';
import { useState } from 'react';

function LevelSelect({ editor }: { editor: Editor }) {
  const value = editor.isActive('heading', { level: 1 })
    ? '1'
    : editor.isActive('heading', { level: 2 })
      ? '2'
      : editor.isActive('heading', { level: 3 })
        ? '3'
        : '0';
  return (
    <select
      className="ft-select"
      title="层级"
      value={value}
      onChange={(e) => {
        const v = e.target.value;
        const chain = editor.chain().focus();
        if (v === '0') chain.setParagraph().run();
        else chain.setNode('heading', { level: Number(v) }).run();
      }}
    >
      <option value="0">正文</option>
      <option value="1">标题 1</option>
      <option value="2">标题 2</option>
      <option value="3">标题 3</option>
    </select>
  );
}

export default function FloatToolbar({ editor, onAskAi }: { editor: Editor; onAskAi?: () => void }) {
  const setLinkPrompt = () => {
    const prev = (editor.getAttributes('link').href as string | undefined) ?? '';
    const url = window.prompt('链接地址（留空解除链接）', prev || 'https://');
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };

  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{ duration: 120, maxWidth: 'none' }}
      shouldShow={({ editor: e, state }) => {
        const { from, to } = state.selection;
        if (from === to) return false; // 无选中不弹
        if (e.isActive('codeBlock') || e.isActive('image')) return false;
        return true;
      }}
    >
      <div className="float-toolbar">
        <LevelSelect editor={editor} />
        <select
          className="ft-select"
          title="字体"
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
          className="ft-select"
          title="字号"
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
        <span className="ft-divider" />
        <button
          className={`ft-btn ${editor.isActive('bold') ? 'active' : ''}`}
          title="加粗 (Ctrl+B)"
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <b>B</b>
        </button>
        <button
          className={`ft-btn ${editor.isActive('italic') ? 'active' : ''}`}
          title="倾斜 (Ctrl+I)"
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <i>I</i>
        </button>
        <span className="ft-divider" />
        <label className="ft-color" title="字体颜色">
          <span className="ft-color-a" style={{ color: editor.getAttributes('textStyle').color || '#334155' }}>A</span>
          <input
            type="color"
            value={editor.getAttributes('textStyle').color || '#334155'}
            onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
          />
        </label>
        <label className="ft-color" title="高亮背景">
          <span className="ft-color-hl">A</span>
          <input
            type="color"
            defaultValue="#fef08a"
            onChange={(e) => editor.chain().focus().setHighlight({ color: e.target.value }).run()}
          />
        </label>
        <button className="ft-btn" title="取消高亮" onClick={() => editor.chain().focus().unsetHighlight().run()}>
          🧽
        </button>
        <span className="ft-divider" />
        <button
          className={`ft-btn ${editor.isActive('link') ? 'active' : ''}`}
          title="插入链接（Ctrl+点击链接打开）"
          onClick={setLinkPrompt}
        >
          🔗
        </button>
        <PolishButton editor={editor} />
        <button
          className="ft-btn"
          title="把选中的表格状文本排版为表格"
          onClick={() => {
            const { from, to } = editor.state.selection;
            const text = editor.state.doc.textBetween(from, to, '\n', '\n');
            const rows = parseTableText(text);
            if (!rows) {
              alert('没有识别到表格结构（需 ≥3 行，Tab/多列空格/管道符分列）');
              return;
            }
            editor.chain().focus().deleteSelection().insertContent(rowsToTableHtml(rows)).run();
          }}
        >
          ⇥
        </button>
        {onAskAi && (
          <button className="ft-btn" title="询问 LLM（对选中内容提问）" onClick={onAskAi}>
            ✨
          </button>
        )}
      </div>
    </BubbleMenu>
  );
}
/** 润色按钮（M16 从旧工具栏迁入浮动工具栏） */
function PolishButton({ editor }: { editor: Editor }) {
  const [polishing, setPolishing] = useState(false);
  return (
    <button
      className="ft-btn"
      title="AI 润色选中文本"
      disabled={polishing}
      onClick={async () => {
        const { from, to, empty } = editor.state.selection;
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
      }}
    >
      {polishing ? '…' : '✒'}
    </button>
  );
}
