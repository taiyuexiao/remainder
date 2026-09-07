import { useEffect, useState } from 'react';
import EditorPage from './EditorPage';
import { primeDoc } from './store';
import './fe.css';

/**
 * feishu-clone 编辑器内核接入壳（M29）：
 * - primeDoc：先把 server 文档灌入同步缓存，再渲染 EditorPage（其 store API 是同步的）
 * - fe-doc-created：文档副本建好后跳真 id
 * - 字体/基色补回（fe.css 的全局 body 规则已剥除）
 */
export default function EditorShell({ docId, onBack }: { docId: string; onBack: () => void }) {
  const [ready, setReady] = useState(false);
  const [realId, setRealId] = useState(docId);

  useEffect(() => {
    setReady(false);
    primeDoc(realId).then(() => setReady(true));
  }, [realId]);

  useEffect(() => {
    const onCreated = (e: Event) => {
      const { tempId, realId: rid } = (e as CustomEvent<{ tempId: string; realId: string }>).detail;
      if (tempId === realId) setRealId(rid);
    };
    window.addEventListener('fe-doc-created', onCreated);
    return () => window.removeEventListener('fe-doc-created', onCreated);
  }, [realId]);

  if (!ready) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-slate-400">文档加载中…</div>
    );
  }

  return (
    <div
      className="h-full fe-doc-root"
      style={{ fontFamily: 'var(--font-ui)', color: 'var(--text-1)', background: 'var(--bg-page, #fff)' }}
    >
      <EditorPage key={realId} docId={realId} onBack={onBack} />
    </div>
  );
}
