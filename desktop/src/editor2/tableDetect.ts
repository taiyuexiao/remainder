/**
 * 表格状纯文本识别（M14）：粘贴/选中时把文本解析为二维表格
 * 支持三种格式：
 *  1. Markdown 管道：| a | b |
 *  2. Tab 分列（Excel/网页复制）
 *  3. 2+ 空格对齐列（API 文档/终端输出常见，分隔线行 ━── 自动忽略）
 */

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 分隔线行：━━━ / ─── / ═══ / --- / === 等 */
const isSepLine = (l: string) => /^[━─═\-_=|+\s]{3,}$/.test(l.trim());

export function parseTableText(text: string): string[][] | null {
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== '' && !isSepLine(l));
  if (lines.length < 2) return null;

  // 1) Markdown 管道：所有行都含 |
  if (lines.every((l) => l.includes('|'))) {
    const rows = lines
      .map((l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((s) => s.trim()))
      .filter((r) => r.length > 1);
    if (rows.length < 2) return null;
    const cols = Math.max(...rows.map((r) => r.length));
    return rows.map((r) => [...r, ...Array(cols - r.length).fill('')]);
  }

  // 2) Tab / 2+ 空格分列
  const rows = lines
    .map((l) => l.split(/\t+| {2,}/).map((s) => s.trim()).filter((s) => s !== ''));
  const multi = rows.filter((r) => r.length >= 2);
  // 防误报：至少 3 行、且 60% 以上行能分出多列
  if (lines.length < 3 || multi.length < Math.ceil(rows.length * 0.6)) return null;
  const cols = Math.max(...rows.map((r) => r.length));
  if (cols < 2) return null;
  return rows.map((r) => [...r, ...Array(cols - r.length).fill('')]);
}

/** 二维数组 → Tiptap Table HTML（首行为表头） */
export function rowsToTableHtml(rows: string[][]): string {
  const [head, ...body] = rows;
  const th = head.map((c) => `<th>${escapeHtml(c)}</th>`).join('');
  const trs = body
    .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`)
    .join('');
  return `<table><tr>${th}</tr>${trs}</table><p></p>`;
}
