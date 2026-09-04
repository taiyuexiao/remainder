/**
 * 文档树手动拖拽状态（M13 改：HTML5 DnD 在 Tauri WebView2 不稳定，改鼠标自实现）
 * 模块级单例，配合 useSyncExternalStore 使用
 */

export interface TreeDragState {
  /** 正在拖拽的文档 id（null = 未拖拽） */
  docId: string | null;
  /** 文档标题（拖拽幽灵框显示） */
  title: string;
  /** 指针位置（幽灵框跟随） */
  x: number;
  y: number;
  /** 悬停目标：文件夹 id / 'root'（树空白区）/ null（无有效目标） */
  hover: string | null;
  /** 是否已构成拖拽（位移超过阈值） */
  active: boolean;
}

const IDLE: TreeDragState = { docId: null, title: '', x: 0, y: 0, hover: null, active: false };

let state: TreeDragState = IDLE;
const listeners = new Set<() => void>();

export const treeDragStore = {
  get: (): TreeDragState => state,
  set(patch: Partial<TreeDragState>) {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  },
  reset() {
    state = IDLE;
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};
