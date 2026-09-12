/**
 * 跨页面导航总线（M34 / A3 client_actions）：
 * agent 动作（open_document / navigate_to）驱动前端跳转。
 * App 监听 app-nav 切栏目；DocsPage 监听 fe-nav-doc 选文档；
 * DocsPage 未挂载时由 pendingDocId 暂存，挂载后消费。
 */
let pendingDocId: string | null = null;

/** 请求打开文档：切到文档栏目 + 选中该文档 */
export function requestOpenDoc(docId: string): void {
  pendingDocId = docId;
  window.dispatchEvent(new CustomEvent('app-nav', { detail: { page: 'docs' } }));
  window.dispatchEvent(new CustomEvent('fe-nav-doc', { detail: { docId } }));
}

/** 请求切换栏目 */
export function requestNav(page: string): void {
  window.dispatchEvent(new CustomEvent('app-nav', { detail: { page } }));
}

/** DocsPage 挂载/处理 fe-nav-doc 时调用：取走待打开文档（一次性） */
export function consumePendingDoc(): string | null {
  const id = pendingDocId;
  pendingDocId = null;
  return id;
}

/* ---------- 文档滚动位置记忆（M33b）：链接跳走前存，返回时恢复 ---------- */
const scrollMap = new Map<string, number>();

/** 记录某文档的滚动位置（.fe-content 的 scrollTop） */
export function saveDocScroll(docId: string, top: number): void {
  if (top > 0) scrollMap.set(docId, top);
}

/** 取出并清除某文档的滚动位置（无记录返回 0） */
export function takeDocScroll(docId: string): number {
  const top = scrollMap.get(docId) ?? 0;
  scrollMap.delete(docId);
  return top;
}
