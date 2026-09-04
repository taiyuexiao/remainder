/** 桌宠渲染后端接口：sprite（立绘条带引擎）/ live2d（pixi + Cubism）两种实现 */
export interface PetRenderer {
  /** 在给定 canvas 上启动渲染循环（尺寸为逻辑像素） */
  start(canvas: HTMLCanvasElement, w: number, h: number): Promise<void>;
  /** 停止渲染并释放资源 */
  dispose(): void;
  /** 跳一下（互动/提醒反馈） */
  hop(): void;
  /** 转个圈（娱乐） */
  spin(): void;
  /** 害羞闪躲（小幅抖动） */
  flinch(): void;
  /** 视线跟随目标，归一化坐标（-1~1，0 为居中） */
  lookAt(x: number, y: number): void;
}

export type PetMode = 'sprite' | 'live2d';

export const PET_MODE_KEY = 'pet-mode';
export const PET_MODEL_KEY = 'pet-live2d-model';
