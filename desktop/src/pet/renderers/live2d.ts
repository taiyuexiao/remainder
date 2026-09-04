import type { Application } from 'pixi.js';
import type { Live2DModel } from 'pixi-live2d-display/cubism4';
import type { PetRenderer } from './types';

declare global {
  interface Window {
    Live2DCubismCore?: unknown;
    Live2D?: unknown; // Cubism 2 core（live2d.min.js）
    PIXI?: unknown;
  }
}

let cubismCoreLoading: Promise<void> | null = null;
let cubism2CoreLoading: Promise<void> | null = null;

function injectScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`${src} 加载失败`));
    document.head.appendChild(s);
  });
}

/** 幂等注入 Live2D Cubism Core（Cubism 3~5，官方 Web SDK runtime，见 M12 文档 license 说明） */
function ensureCubismCore(): Promise<void> {
  if (window.Live2DCubismCore) return Promise.resolve();
  cubismCoreLoading ??= injectScript('/live2dcubismcore.min.js');
  return cubismCoreLoading;
}

/** 幂等注入 Cubism 2 core（老模型 .moc 用） */
function ensureCubism2Core(): Promise<void> {
  if (window.Live2D) return Promise.resolve();
  cubism2CoreLoading ??= injectScript('/live2d.min.js');
  return cubism2CoreLoading;
}

/** 模型的动作组名各包不一，按常见命名逐个尝试 */
async function playAnyMotion(model: { motion: (g: string) => Promise<boolean> }, groups: string[]) {
  for (const g of groups) {
    try {
      if (await model.motion(g)) return;
    } catch {
      /* 该模型没有此动作组，试下一个 */
    }
  }
}

/**
 * 真 Live2D 渲染器（Open-LLM-VTuber 式）：pixi.js + pixi-live2d-display。
 * 支持 Cubism 3~5（.model3.json）与 Cubism 2（model.json，老游戏提取模型）。
 * modelUrl 为 server 下发的绝对地址（贴图/moc 由库按相对路径自动解析）。
 */
export function createLive2DRenderer(modelUrl: string, format: 'cubism4' | 'cubism2' = 'cubism4'): PetRenderer {
  let app: Application | null = null;
  let model: Live2DModel | null = null;
  let canvasEl: HTMLCanvasElement | null = null;
  let W = 0;
  let H = 0;
  let gazeTarget = { x: 0, y: 0 };
  let disposed = false;

  // spin/flinch 用 canvas 容器 CSS 变换实现（模式无关的小特效）
  const cssSpin = () => {
    const c = canvasEl;
    if (!c) return;
    c.style.transition = 'transform 0.7s ease-in-out';
    c.style.transform = 'rotate(360deg)';
    window.setTimeout(() => {
      c.style.transition = 'none';
      c.style.transform = '';
    }, 720);
  };
  const cssFlinch = () => {
    const c = canvasEl;
    if (!c) return;
    c.style.transition = 'transform 0.06s';
    let n = 0;
    const tick = () => {
      if (n >= 6 || disposed) { c.style.transform = ''; return; }
      c.style.transform = `translateX(${(n % 2 === 0 ? 1 : -1) * 4 * (1 - n / 6)}px)`;
      n += 1;
      window.setTimeout(tick, 60);
    };
    tick();
  };

  return {
    async start(canvas, w, h) {
      canvasEl = canvas;
      W = w;
      H = h;
      const PIXI = await import('pixi.js');
      window.PIXI = PIXI; // pixi-live2d-display 内部从全局取 PIXI
      let Live2DModel: typeof import('pixi-live2d-display/cubism4').Live2DModel;
      if (format === 'cubism2') {
        await ensureCubism2Core();
        ({ Live2DModel } = await import('pixi-live2d-display/cubism2'));
      } else {
        await ensureCubismCore();
        ({ Live2DModel } = await import('pixi-live2d-display/cubism4'));
      }
      if (disposed) return;

      const pixiApp = new PIXI.Application({
        view: canvas,
        width: W,
        height: H,
        backgroundAlpha: 0,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });
      app = pixiApp;

      const m = await Live2DModel.from(modelUrl, { autoInteract: false });
      if (disposed) { pixiApp.destroy(false, { children: true }); return; }
      model = m;

      // 自适应窗口：完整显示、底部对齐、水平居中
      const s = (Math.min(W / m.width, H / m.height) * 0.95);
      m.scale.set(s);
      m.x = (W - m.width) / 2;
      m.y = H - m.height;
      // pnpm 下 pixi-live2d-display 的 @pixi/display 与 pixi.js 内嵌版本不同源，类型强转（同为 6.x，运行时兼容）
      pixiApp.stage.addChild(m as unknown as import('pixi.js').DisplayObject);

      // 视线跟随：每帧把归一化目标映射到画布坐标
      pixiApp.ticker.add(() => {
        if (!model) return;
        try {
          model.focus((gazeTarget.x + 1) * 0.5 * W, (gazeTarget.y + 1) * 0.5 * H);
        } catch {
          /* 个别模型 focus 失败可忽略 */
        }
      });
    },

    dispose() {
      disposed = true;
      model = null;
      // removeView=false：canvas 元素由 React 管理，只释放 pixi 资源
      app?.destroy(false, { children: true, texture: true, baseTexture: true });
      app = null;
      canvasEl = null;
    },

    hop() {
      if (model) void playAnyMotion(model, ['TapBody', 'tap_body', 'Tap', 'tap', 'FlickHead', 'Idle', 'idle']);
    },
    spin() {
      cssSpin();
      if (model) void playAnyMotion(model, ['TapBody', 'tap_body', 'Idle', 'idle']);
    },
    flinch() {
      cssFlinch();
    },
    lookAt(x, y) {
      gazeTarget = { x, y };
    },
  };
}
