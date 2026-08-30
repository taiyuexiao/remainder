import { useEffect, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { api } from '../api/client';

/** 从剪贴板 HTML 提取标题：优先 <title>，否则纯文本前 50 字 */
function titleFromHtml(html: string): string {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (m?.[1]?.trim()) return m[1].trim();
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.slice(0, 50);
}

export default function CapturePage() {
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [saved, setSaved] = useState(false);
  const [clipMsg, setClipMsg] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 窗口每次显示时自动聚焦输入框
  useEffect(() => {
    inputRef.current?.focus();
    const unlisten = getCurrentWindow().onFocusChanged(({ payload }) => {
      if (payload) inputRef.current?.focus();
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const close = async () => {
    setContent('');
    setTags('');
    setSaved(false);
    setClipMsg('');
    await getCurrentWindow().hide();
  };

  const save = async () => {
    if (!content.trim()) return;
    await api.createInbox(content.trim(), tags.trim());
    setSaved(true);
    setContent('');
    setTags('');
    window.setTimeout(close, 600);
  };

  // 剪贴板剪藏（M11.3）：微信/浏览器复制的图文（CF_HTML）直接入剪藏箱
  const clipFromClipboard = async () => {
    setClipMsg('');
    let html: string | null = null;
    try {
      html = await invoke<string | null>('read_clipboard_html');
    } catch {
      setClipMsg('当前环境不支持读剪贴板（需在桌面端使用）');
      return;
    }
    if (!html) {
      setClipMsg('剪贴板无富文本，直接用上面输入框速记');
      return;
    }
    await api.createClip({
      html,
      url: '',
      title: titleFromHtml(html),
      source: 'clipboard',
    });
    setClipMsg('已剪藏 ✓');
    window.setTimeout(close, 600);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      save();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      save();
    }
  };

  return (
    <div className="h-screen w-screen p-2 select-none" onKeyDown={onKeyDown}>
      <div className="h-full rounded-2xl bg-slate-900/85 backdrop-blur-xl border border-white/15 shadow-2xl flex flex-col overflow-hidden">
        <div className="px-4 pt-3 pb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-white/80">💡 速记</span>
          <span className="text-[10px] text-white/30">Enter 存入 · Esc 关闭</span>
        </div>
        <textarea
          ref={inputRef}
          className="flex-1 mx-4 mb-2 rounded-lg bg-white/10 text-white text-sm px-3 py-2 resize-none placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          placeholder="有什么想法？写下来…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <div className="px-4 pb-3 flex items-center gap-2">
          <input
            className="w-40 rounded-lg bg-white/10 text-white text-xs px-2.5 py-1.5 placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            placeholder="标签（可选）"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
          <span className="flex-1" />
          {saved && <span className="text-xs text-emerald-400">已存入 Inbox ✓</span>}
          {clipMsg && (
            <span className={`text-xs ${clipMsg.includes('✓') ? 'text-emerald-400' : 'text-amber-300'}`}>
              {clipMsg}
            </span>
          )}
          <button
            onClick={clipFromClipboard}
            title="把剪贴板里的富文本（微信图文/网页片段）存入剪藏箱"
            className="rounded-lg bg-white/10 text-white/80 text-xs px-3 py-1.5 hover:bg-white/20"
          >
            📋 剪贴板剪藏
          </button>
          <button
            onClick={save}
            className="rounded-lg bg-indigo-500 text-white text-xs px-3.5 py-1.5 hover:bg-indigo-400"
          >
            存入
          </button>
        </div>
      </div>
    </div>
  );
}
