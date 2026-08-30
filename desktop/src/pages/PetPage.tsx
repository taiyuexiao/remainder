import { useEffect, useRef, useState } from 'react';
import { getCurrentWindow, getAllWindows, LogicalSize, LogicalPosition, currentMonitor } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { api } from '../api/client';
import petImg from '../assets/pet/remielle.png';

/* ============ 伪 Live2D 动画参数 ============ */
const STRIPS = 48;
const HEAD_RATIO = 0.45;

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
  const anim = useRef({
    gaze: { x: 0, y: 0 },
    gazeTarget: { x: 0, y: 0 },
    hopT: -1,
    spinT: -1,
    flinchT: -1,
  });

  const [W, H] = SIZES[sizeIdx];

  const showBubble = (text: string, ms = 4000) => {
    setBubble(text);
    window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => setBubble(null), ms);
  };

  const hop = () => { anim.current.hopT = 0; };
  const spin = () => { anim.current.spinT = 0; };

  const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

  const patHead = () => { hop(); showBubble(pick(HEAD_LINES)); };

  const shy = () => {
    anim.current.flinchT = 0;
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
    const unlisten = listen<number>('pet-resize', (e) => { void applySize(Number(e.payload)); });
    return () => { unlisten.then((f) => f()); };
  }, []);

  /* ---------- 提醒事件 ---------- */
  useEffect(() => {
    const unlisten = listen<string>('pet-reminder', (e) => {
      hop();
      showBubble(`⏰ 任务到期：${e.payload}`, 6000);
    });
    return () => { unlisten.then((f) => f()); };
  }, []);

  /* ---------- 主渲染循环 ---------- */
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const img = new Image();
    img.src = petImg;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;

    let raf = 0;
    let disposed = false;

    img.onload = () => {
      const t0 = performance.now();
      const a = anim.current;

      const frame = (nowMs: number) => {
        if (disposed) return;
        const t = (nowMs - t0) / 1000;
        const iw = img.width;
        const ih = img.height;
        const scale = Math.min(W / iw, H / ih) * 0.98;
        const dw = iw * scale;
        const dh = ih * scale;
        const baseX = (W - dw) / 2;
        const baseY = H - dh - 2;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);

        const breathe = 1 + 0.012 * Math.sin(t * (Math.PI * 2) / 3.6);
        let rotate = 0.008 * Math.sin(t * (Math.PI * 2) / 6.2);
        a.gaze.x += (a.gazeTarget.x - a.gaze.x) * 0.08;
        a.gaze.y += (a.gazeTarget.y - a.gaze.y) * 0.08;

        let hopY = 0;
        let squashX = 1;
        let squashY = 1;
        if (a.hopT >= 0) {
          a.hopT += 1 / 60;
          const p = a.hopT / 0.55;
          if (p >= 1) a.hopT = -1;
          else if (p < 0.25) { const k = p / 0.25; squashY = 1 - 0.1 * k; squashX = 1 + 0.08 * k; }
          else if (p < 0.6) { const k = (p - 0.25) / 0.35; hopY = -20 * (H / 430) * Math.sin(k * Math.PI * 0.9); squashY = 1 + 0.07 * Math.sin(k * Math.PI); squashX = 1 - 0.05 * Math.sin(k * Math.PI); }
          else { const k = (p - 0.6) / 0.4; squashY = 1 - 0.06 * Math.sin(k * Math.PI); squashX = 1 + 0.05 * Math.sin(k * Math.PI); }
        }
        // 转圈（娱乐模式）
        if (a.spinT >= 0) {
          a.spinT += 1 / 60;
          const p = a.spinT / 0.7;
          if (p >= 1) a.spinT = -1;
          else rotate += p * Math.PI * 2;
        }
        // 害羞闪躲（小幅快速抖动 + 后仰）
        let flinchX = 0;
        if (a.flinchT >= 0) {
          a.flinchT += 1 / 60;
          const p = a.flinchT / 0.45;
          if (p >= 1) a.flinchT = -1;
          else flinchX = Math.sin(p * Math.PI * 6) * 4 * (1 - p) * (W / 300);
        }

        ctx.save();
        const anchorX = baseX + dw / 2;
        const anchorY = baseY + dh;
        ctx.translate(anchorX + flinchX, anchorY + hopY);
        ctx.rotate(rotate);
        ctx.scale(squashX, breathe * squashY);
        ctx.translate(-anchorX, -anchorY);

        const sh = ih / STRIPS;
        for (let i = 0; i < STRIPS; i++) {
          const sy = i * sh;
          const ratio = 1 - Math.min(i / (STRIPS * HEAD_RATIO), 1);
          const gx = a.gaze.x * 6 * ratio;
          const gy = a.gaze.y * 4 * ratio;
          ctx.drawImage(
            img,
            0, sy, iw, sh,
            baseX + gx, baseY + (sy * dh) / ih + gy, dw, (sh * dh) / ih + 0.5,
          );
        }

        ctx.restore();
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    };
    return () => { disposed = true; cancelAnimationFrame(raf); };
  }, [W, H]);

  /* ---------- 视线跟随 ---------- */
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      anim.current.gazeTarget = {
        x: (e.clientX / window.innerWidth - 0.5) * 2,
        y: (e.clientY / window.innerHeight - 0.4) * 2,
      };
    };
    const onLeave = () => { anim.current.gazeTarget = { x: 0, y: 0 }; };
    window.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  /* ---------- 单击分区域互动（崩三式） ---------- */
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const clickTimer = useRef<number>(0);

  const onMouseDown = async (e: React.MouseEvent) => {
    setMenu(null); // 菜单 bug 修复：任意按下即关菜单（原来依赖 click，被拖拽吞掉）
    if (e.button !== 0) return;
    dragStart.current = { x: e.screenX, y: e.screenY };
    await getCurrentWindow().startDragging();
  };

  const onMouseUp = (e: React.MouseEvent) => {
    if (!dragStart.current) return;
    const dx = e.screenX - dragStart.current.x;
    const dy = e.screenY - dragStart.current.y;
    dragStart.current = null;
    if (Math.hypot(dx, dy) >= 5) return; // 拖动不触发互动

    // 单击 vs 双击：用 timer 区分
    if (clickTimer.current) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = 0;
      setChatOpen((v) => !v); // 双击 = 对话框
      return;
    }
    const ry = e.clientY / window.innerHeight;
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = 0;
      if (ry < 0.32) patHead();          // 头部：摸头
      else if (ry > 0.42 && ry < 0.62) shy(); // 胸部：害羞
      else touchBody();                   // 其他：通用
    }, 260);
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

      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-pointer"
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
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
