import type { PetRenderer } from './types';
import petImg from '../../assets/pet/remielle.png';

/* ============ 伪 Live2D 动画参数 ============ */
const STRIPS = 48;
const HEAD_RATIO = 0.45;

/**
 * 立绘条带引擎（伪 Live2D）—— 行为与 M9 原版完全一致，仅做模块搬移。
 * 单张透明底立绘 PNG，切 48 条水平条带逐条 drawImage 加偏移，
 * 叠加程序化呼吸/摇晃/跳跃挤压/转圈/害羞抖动/视线跟随。
 */
export function createSpriteRenderer(): PetRenderer {
  const anim = {
    gaze: { x: 0, y: 0 },
    gazeTarget: { x: 0, y: 0 },
    hopT: -1,
    spinT: -1,
    flinchT: -1,
  };
  let raf = 0;
  let disposed = false;

  return {
    start(canvas, W, H) {
      return new Promise((resolve) => {
        const ctx = canvas.getContext('2d')!;
        const img = new Image();
        img.src = petImg;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = W * dpr;
        canvas.height = H * dpr;

        img.onload = () => {
          const t0 = performance.now();
          const a = anim;

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
          resolve();
        };
      });
    },

    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
    },

    hop() { anim.hopT = 0; },
    spin() { anim.spinT = 0; },
    flinch() { anim.flinchT = 0; },
    lookAt(x, y) { anim.gazeTarget = { x, y }; },
  };
}
