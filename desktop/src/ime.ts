import { useRef } from 'react';

/**
 * macOS 中文输入法回车误提交守卫（M22 首修 isComposing，此处补 WebKit 特例）：
 * WKWebView 里按回车确认候选词（如打英文 ai 后回车上屏）时，compositionend
 * 先派发、随后才是确认键的 keydown，该 keydown 的 isComposing 已经是 false，
 * 仅判 isComposing 会漏。
 *
 * guard 三层判断，不依赖任何派发时序假设：
 * 1. composition 标记：组词进行中（compositionstart 置位 / compositionend 复位）
 * 2. isComposing / keyCode 229：标准浏览器语义
 * 3. 时间戳兜底：确认键 keydown 与 compositionend 是同一次按键的同步产物，
 *    两者 timeStamp 几乎相同；人手再按的下一次回车至少相隔几十毫秒
 *
 * 用法：
 *   const { guard, compositionProps } = useImeGuard();
 *   <input {...compositionProps} onKeyDown={(e) => { if (guard(e)) return; ... }} />
 * composition 事件会冒泡，compositionProps 也可以挂在共同父容器上统一拦截。
 */
export function useImeGuard() {
  const composingRef = useRef(false);
  const endedAtRef = useRef(-1e9);
  const guard = (e: { nativeEvent: KeyboardEvent }) => {
    const n = e.nativeEvent;
    if (composingRef.current || n.isComposing || n.keyCode === 229) return true;
    return n.timeStamp - endedAtRef.current < 50;
  };
  const compositionProps = {
    onCompositionStart: () => {
      composingRef.current = true;
    },
    onCompositionEnd: (e: { nativeEvent: { timeStamp: number } }) => {
      composingRef.current = false;
      endedAtRef.current = e.nativeEvent.timeStamp;
    },
  };
  return { guard, compositionProps };
}
