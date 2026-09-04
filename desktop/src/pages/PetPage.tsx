import { useEffect, useRef, useState } from 'react';
import { getCurrentWindow, getAllWindows, LogicalSize, LogicalPosition, PhysicalPosition, currentMonitor } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { api } from '../api/client';
import { createSpriteRenderer } from '../pet/renderers/sprite';
import { createLive2DRenderer } from '../pet/renderers/live2d';
import { PET_MODE_KEY, PET_MODEL_KEY, type PetMode, type PetRenderer } from '../pet/renderers/types';

const SIZES: [number, number][] = [[140, 200], [210, 301], [300, 430]];
const SIZE_KEY = 'pet-size';

/* ============ 台词库 ============ */
const HEAD_LINES = ['在呢在呢~', '摸头杀什么的…还不赖啦', '今天也要加油哦！', '嗯？想我了吗？'];
const SHY_LINES = ['呀！你、你干什么…', '不、不许碰那里…', '哼，流氓！', '（脸红）快去做正事啦…', '再、再这样我就不理你了…'];
const BODY_LINES = ['要努力工作哦', '我在这儿陪着你呢', '别分神，先看任务~'];
const CHAT_FALLBACK = [
  '嗯嗯，我在听~',
  '先配好 DeepSeek 的 key，我就能真正陪你聊天啦',
  '今天的工作顺利吗？',
  '要我提醒你待办吗？',
];

type Msg = { from: 'me' | 'pet'; text: string };

const isTauri = '__TAURI_INTERNALS__' in window;

export default function PetPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [bubble, setBubble] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [blush, setBlush] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [sizeIdx, setSizeIdx] = useState(() => {
    const v = Number(localStorage.getItem(SIZE_KEY) ?? 0);
    return v >= 0 && v < SIZES.length ? v : 0;
  });
  const bubbleTimer = useRef<number>(0);
  const blushTimer = useRef<number>(0);
  const rendererRef = useRef<PetRenderer | null>(null);
  // 调试覆写：#/pet?mode=live2d&model=Hiyori 可强制指定引擎/模型（浏览器手测用）
  const hashQuery = new URLSearchParams(location.hash.split('?')[1] ?? '');
  const debugMode = hashQuery.get('mode');
  const debugModel = hashQuery.get('model');
  const [mode, setMode] = useState<PetMode>(() =>
    debugMode === 'live2d' || (!debugMode && localStorage.getItem(PET_MODE_KEY) === 'live2d') ? 'live2d' : 'sprite',
  );
  const [modelName, setModelName] = useState(() => debugModel ?? localStorage.getItem(PET_MODEL_KEY) ?? '');

  const [W, H] = SIZES[sizeIdx];

  // 点击/双击计时（单击 vs 双击用时间间隔判定）
  const lastClickAt = useRef(0);
  const DOUBLE_CLICK_MS = 260;

  const showBubble = (text: string, ms = 4000) => {
    setBubble(text);
    window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => setBubble(null), ms);
  };

  const hop = () => rendererRef.current?.hop();
  const spin = () => rendererRef.current?.spin();

  const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

  const patHead = () => { hop(); showBubble(pick(HEAD_LINES)); };

  const shy = () => {
    rendererRef.current?.flinch();
    setBlush(true);
    window.clearTimeout(blushTimer.current);
    blushTimer.current = window.setTimeout(() => setBlush(false), 2200);
    showBubble(pick(SHY_LINES), 3000);
  };

  const touchBody = () => { hop(); showBubble(pick(BODY_LINES)); };

  /* ---------- 尺寸（主窗口设置页控制） ---------- */
  const applySize = async (idx: number) => {
    setSizeIdx(idx);
    localStorage.setItem(SIZE_KEY, String(idx));
    const [w, h] = SIZES[idx];
    const win = getCurrentWindow();
    await win.setSize(new LogicalSize(w, h));
    const monitor = await currentMonitor();
    if (monitor) {
      const scale = monitor.scaleFactor;
      const lw = monitor.size.width / scale;
      const lh = monitor.size.height / scale;
      await win.setPosition(new LogicalPosition(lw - w - 30, lh - h - 60));
    }
  };

  useEffect(() => {
    if (!isTauri) return;
    const unlisten = listen<number>('pet-resize', (e) => { void applySize(Number(e.payload)); });
    return () => { unlisten.then((f) => f()); };
  }, []);

  /* ---------- 提醒事件 ---------- */
  useEffect(() => {
    if (!isTauri) return;
    const unlisten = listen<string>('pet-reminder', (e) => {
      hop();
      showBubble(`⏰ 任务到期：${e.payload}`, 6000);
    });
    return () => { unlisten.then((f) => f()); };
  }, []);

  /* ---------- 主渲染循环（按模式选择渲染后端） ---------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let renderer: PetRenderer | null = null;

    (async () => {
      if (mode === 'live2d') {
        try {
          const { models } = await api.listLive2dModels();
          if (cancelled) return;
          const target = models.find((m) => m.name === modelName) ?? models[0];
          if (!target) throw new Error('no model');
          const r = createLive2DRenderer(target.url, target.format);
          if (cancelled) return;
          await r.start(canvas, W, H);
          if (cancelled) { r.dispose(); return; }
          renderer = r;
          rendererRef.current = r;
          return;
        } catch {
          if (cancelled) return;
          showBubble('Live2D 模型未就绪，已切回立绘模式（设置 → 桌宠 查看模型目录）', 6000);
        }
      }
      // sprite 模式（默认 / live2d 回落）
      const r = createSpriteRenderer();
      await r.start(canvas, W, H);
      if (cancelled) { r.dispose(); return; }
      renderer = r;
      rendererRef.current = r;
    })();

    return () => {
      cancelled = true;
      rendererRef.current = null;
      renderer?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, H, mode, modelName]);

  /* ---------- 模式/模型切换（设置页广播） ---------- */
  useEffect(() => {
    if (!isTauri) return;
    const unMode = listen<string>('pet-mode', (e) => {
      const v = e.payload === 'live2d' ? 'live2d' : 'sprite';
      localStorage.setItem(PET_MODE_KEY, v);
      setMode(v);
    });
    const unModel = listen<string>('pet-model', (e) => {
      localStorage.setItem(PET_MODEL_KEY, e.payload);
      setModelName(e.payload);
    });
    return () => {
      unMode.then((f) => f());
      unModel.then((f) => f());
    };
  }, []);

  /* ---------- 视线跟随 ---------- */
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      rendererRef.current?.lookAt(
        (e.clientX / window.innerWidth - 0.5) * 2,
        (e.clientY / window.innerHeight - 0.4) * 2,
      );
    };
    const onLeave = () => rendererRef.current?.lookAt(0, 0);
    window.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  /* ---------- 单击分区域互动 + 自己实现拖拽 ---------- */
  // 自己实现拖拽：避免 Tauri startDragging() 吞掉 mouseup，导致单击/双击失效
  const drag = useRef<{
    startX: number;
    startY: number;
    winX: number;
    winY: number;
    dragging: boolean;
  } | null>(null);

  const onMouseDown = async (e: React.MouseEvent) => {
    setMenu(null);
    if (e.button !== 0) return;

    const win = getCurrentWindow();
    const pos = await win.outerPosition();
    drag.current = {
      startX: e.screenX,
      startY: e.screenY,
      winX: pos.x,
      winY: pos.y,
      dragging: false,
    };

    const onMove = (ev: MouseEvent) => {
      if (!drag.current) return;
      const dx = ev.screenX - drag.current.startX;
      const dy = ev.screenY - drag.current.startY;
      if (!drag.current.dragging && Math.hypot(dx, dy) > 4) {
        drag.current.dragging = true;
      }
      if (drag.current.dragging) {
        void win.setPosition(
          new PhysicalPosition(drag.current.winX + dx, drag.current.winY + dy),
        );
      }
    };

    const onUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (!drag.current) return;

      const wasDragging = drag.current.dragging;
      const dx = ev.screenX - drag.current.startX;
      const dy = ev.screenY - drag.current.startY;
      drag.current = null;

      // 拖动不触发互动
      if (wasDragging || Math.hypot(dx, dy) > 4) return;

      const now = Date.now();
      if (now - lastClickAt.current < DOUBLE_CLICK_MS) {
        // 双击：开关对话框
        lastClickAt.current = 0;
        setChatOpen((v) => !v);
        return;
      }
      lastClickAt.current = now;

      // 延迟判定单击，若超时未再次点击则执行区域互动
      window.setTimeout(() => {
        if (Date.now() - lastClickAt.current >= DOUBLE_CLICK_MS) {
          lastClickAt.current = 0;
          const ry = ev.clientY / window.innerHeight;
          if (ry < 0.35) patHead();              // 头部：摸头
          else if (ry > 0.42 && ry < 0.62) shy(); // 胸部：害羞
          else touchBody();                       // 其他：通用
        }
      }, DOUBLE_CLICK_MS + 10);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  /* ---------- Esc 关菜单/对话框 ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMenu(null); setChatOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openMain = async () => {
    const main = (await getAllWindows()).find((w) => w.label === 'main');
    if (main) { await main.show(); await main.setFocus(); }
    setMenu(null);
  };

  /* ---------- 对话 ---------- */
  const sendChat = async () => {
    const text = input.trim();
    if (!text || chatLoading) return;
    setInput('');
    setMsgs((m) => [...m, { from: 'me', text }]);
    setChatLoading(true);
    try {
      const { result } = await api.chat(text);
      setMsgs((m) => [...m, { from: 'pet', text: result }]);
    } catch {
      setMsgs((m) => [...m, { from: 'pet', text: pick(CHAT_FALLBACK) }]);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div
      className="h-screen w-screen relative select-none"
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      {/* 气泡（台词/提醒） */}
      {bubble && !chatOpen && (
        <div className="absolute top-1 left-1/2 -translate-x-1/2 z-10" style={{ maxWidth: W - 8 }}>
          <div className="rounded-2xl bg-white/95 shadow-lg border border-pink-100 px-3 py-1.5 text-[11px] text-slate-700 leading-relaxed">
            {bubble}
          </div>
          <div className="w-2 h-2 bg-white/95 border-b border-r border-pink-100 rotate-45 mx-auto -mt-1" />
        </div>
      )}

      {/* 对话框（双击唤起） */}
      {chatOpen && (
        <div
          className="absolute z-20 rounded-2xl bg-white/95 shadow-xl border border-pink-100 flex flex-col"
          style={{ top: 4, left: '50%', transform: 'translateX(-50%)', width: Math.min(W + 60, 260), maxHeight: 220 }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-[10px] text-pink-400 font-medium border-b border-pink-50 flex justify-between items-center">
            <span>和蕾米埃尔聊聊</span>
            <button onClick={() => setChatOpen(false)} className="text-slate-300 hover:text-slate-500">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5 min-h-[80px]">
            {msgs.length === 0 && <p className="text-[10px] text-slate-400">说点什么吧…</p>}
            {msgs.map((m, i) => (
              <div key={i} className={`text-[11px] leading-relaxed ${m.from === 'me' ? 'text-right' : ''}`}>
                <span className={`inline-block rounded-xl px-2.5 py-1 ${m.from === 'me' ? 'bg-indigo-500 text-white' : 'bg-pink-50 text-slate-700'}`}>
                  {m.text}
                </span>
              </div>
            ))}
            {chatLoading && <p className="text-[10px] text-slate-400">蕾米埃尔思考中…</p>}
          </div>
          <div className="p-2 border-t border-pink-50 flex gap-1.5">
            <input
              autoFocus
              className="flex-1 rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-pink-300"
              placeholder="输入消息…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendChat()}
            />
            <button onClick={sendChat} className="rounded-lg bg-pink-400 text-white px-2.5 text-[11px] hover:bg-pink-500">
              发送
            </button>
          </div>
        </div>
      )}

      {/* 脸红（害羞时） */}
      {blush && (
        <>
          <div
            className="absolute rounded-full pointer-events-none transition-opacity duration-300"
            style={{
              left: W * 0.22, top: H * 0.30, width: W * 0.16, height: W * 0.07,
              background: 'radial-gradient(ellipse, rgba(244,114,182,0.55), transparent)',
            }}
          />
          <div
            className="absolute rounded-full pointer-events-none transition-opacity duration-300"
            style={{
              left: W * 0.56, top: H * 0.29, width: W * 0.16, height: W * 0.07,
              background: 'radial-gradient(ellipse, rgba(244,114,182,0.55), transparent)',
            }}
          />
        </>
      )}

      {/* key 随模式/模型变化强制重建 canvas：2d 与 webgl 上下文不能共用一个 canvas 元素 */}
      <canvas
        key={`${mode}-${modelName}`}
        ref={canvasRef}
        className="w-full h-full cursor-pointer"
        onMouseDown={onMouseDown}
      />

      {/* 右键菜单：娱乐模式 + 功能 */}
      {menu && (
        <div
          className="fixed z-50 rounded-lg bg-slate-800 border border-white/10 shadow-xl py-1 text-xs text-white/90 w-32"
          style={{ left: menu.x, top: menu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1 text-[10px] text-white/40">娱乐模式</div>
          <button onClick={() => { hop(); setMenu(null); }} className="w-full text-left px-3 py-1.5 hover:bg-white/10">
            跳一下
          </button>
          <button onClick={() => { spin(); setMenu(null); }} className="w-full text-left px-3 py-1.5 hover:bg-white/10">
            转个圈
          </button>
          <button onClick={() => { shy(); setMenu(null); }} className="w-full text-left px-3 py-1.5 hover:bg-white/10">
            脸红一下
          </button>
          <button onClick={() => { patHead(); setMenu(null); }} className="w-full text-left px-3 py-1.5 hover:bg-white/10">
            摸摸头
          </button>
          <div className="my-1 border-t border-white/10" />
          <button onClick={openMain} className="w-full text-left px-3 py-1.5 hover:bg-white/10">
            打开主窗口
          </button>
          <button
            onClick={async () => { await getCurrentWindow().hide(); setMenu(null); }}
            className="w-full text-left px-3 py-1.5 hover:bg-white/10 text-red-300"
          >
            隐藏桌宠
          </button>
        </div>
      )}
    </div>
  );
}
