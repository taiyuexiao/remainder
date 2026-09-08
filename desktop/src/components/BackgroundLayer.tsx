import { useEffect, useState } from 'react';
import { API_BASE } from '../api/client';

/**
 * 个性化背景层（M30 P1.1 scrim 模型）：
 * 背景图 100% 鲜艳 → scrim 遮罩层（白/黑纱布，可调浓度）→ 内容（卡片永远实心）。
 * 参考 Material Design scrim / iOS 锁屏壁纸压暗 / Muzei dim+grey。
 * 配置存 localStorage 'bg-config'，热应用靠 'bg-config-changed' 事件；图在 server 侧。
 * 兼容：旧配置的 opacity 字段自动折算为 scrim 强度（scrim = 1 - opacity）。
 */

export interface BgConfig {
  enabled: boolean;
  /** scrim 遮罩强度 0.6~0.95（默认 0.85）——越大内容越干净、图越弱 */
  scrim: number;
  /** 深色图切黑色遮罩 */
  scrimDark: boolean;
  /** 毛玻璃 px（作用于图本身） */
  blur: number;
  /** 变暗 0~0.6（Muzei DIM） */
  dim: number;
  /** 灰度 0~1（Muzei GREY） */
  grey: number;
  fit: 'cover' | 'contain' | 'fill';
  ts: number;
}

export const DEFAULT_BG: BgConfig = {
  enabled: false, scrim: 0.85, scrimDark: false, blur: 0, dim: 0, grey: 0, fit: 'cover', ts: 0,
};

export function loadBgConfig(): BgConfig {
  try {
    const raw = localStorage.getItem('bg-config');
    if (!raw) return { ...DEFAULT_BG };
    const parsed = JSON.parse(raw) as Partial<BgConfig> & { opacity?: number };
    // 旧版 opacity（图的浓度）→ scrim 强度
    if (parsed.scrim === undefined && typeof parsed.opacity === 'number') {
      parsed.scrim = Math.min(0.95, Math.max(0.6, 1 - parsed.opacity));
    }
    delete parsed.opacity;
    return { ...DEFAULT_BG, ...parsed };
  } catch {
    return { ...DEFAULT_BG };
  }
}

export function saveBgConfig(cfg: BgConfig) {
  localStorage.setItem('bg-config', JSON.stringify(cfg));
  window.dispatchEvent(new CustomEvent('bg-config-changed'));
}

export function BackgroundLayer() {
  const [cfg, setCfg] = useState<BgConfig>(loadBgConfig);

  useEffect(() => {
    const on = () => setCfg(loadBgConfig());
    window.addEventListener('bg-config-changed', on);
    return () => window.removeEventListener('bg-config-changed', on);
  }, []);

  // 背景启用时：导航栏/页面壳层降为半透明（内容卡片保持实心，可读性红线）
  useEffect(() => {
    document.body.classList.toggle('app-has-bg', cfg.enabled);
    return () => document.body.classList.remove('app-has-bg');
  }, [cfg.enabled]);

  if (!cfg.enabled) return null;

  const filters: string[] = [];
  if (cfg.blur > 0) filters.push(`blur(${cfg.blur}px)`);
  if (cfg.dim > 0) filters.push(`brightness(${1 - cfg.dim})`);
  if (cfg.grey > 0) filters.push(`grayscale(${cfg.grey})`);

  return (
    // z-index: -1 沉到所有内容之下（M30 修复：z-0 会盖住非定位的 main 内容——设置页全被遮罩遮挡）
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: -1 }} aria-hidden>
      {/* 背景图：永远 100% 鲜艳 */}
      <img
        src={`${API_BASE}/api/assets/background?t=${cfg.ts}`}
        alt=""
        className="absolute inset-0 w-full h-full"
        style={{
          objectFit: cfg.fit,
          filter: filters.length ? filters.join(' ') : undefined,
          transform: cfg.blur > 0 ? 'scale(1.05)' : undefined, // 毛玻璃边缘补偿
        }}
        onError={() => setCfg((c) => ({ ...c, enabled: false }))}
      />
      {/* scrim 遮罩层：图与内容之间的纱布 */}
      <div
        className="absolute inset-0"
        style={{
          background: cfg.scrimDark
            ? `rgba(15, 17, 21, ${cfg.scrim})`
            : `rgba(248, 250, 252, ${cfg.scrim})`,
        }}
      />
    </div>
  );
}
