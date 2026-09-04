/**
 * 文档结构文本互转（M16 AI 排版用）：
 * extractStructuredText —— 编辑器 → 带 Markdown 标记的文本（保留现有层级供 LLM 修正）
 * markdownToDoc —— LLM 输出的标记文本 → Tiptap JSON
 */
import type { Editor } from '@tiptap/core';
import type { PMNode } from './pmTypes';

const inlineText = (node: PMNode): string =>
  node.text ?? (node.content ?? []).map(inlineText).join('');

/** 编辑器 → 带结构标记的文本 */
export function extractStructuredText(editor: Editor): string {
  const lines: string[] = [];
  const walk = (node: PMNode, depth: number) => {
    switch (node.type) {
      case 'heading':
        lines.push(`${'#'.repeat(node.attrs?.level ?? 1)} ${inlineText(node)}`);
        return;
      case 'paragraph':
        lines.push(inlineText(node));
        return;
      case 'bulletList':
      case 'orderedList':
      case 'taskList':
        (node.content ?? []).forEach((item, i) => {
          const mark =
            node.type === 'taskList'
              ? item.attrs?.checked ? '- [x] ' : '- [ ] '
              : node.type === 'orderedList'
                ? `${i + 1}. `
                : '- ';
          // listItem 首段为文本，其余子块递归
          const [first, ...rest] = item.content ?? [];
          lines.push('  '.repeat(depth) + mark + (first ? inlineText(first) : ''));
          rest.forEach((sub) => walk(sub, depth + 1));
        });
        return;
      case 'blockquote':
        (node.content ?? []).forEach((c) => lines.push('> ' + inlineText(c)));
        return;
      case 'codeBlock':
        lines.push('```', inlineText(node), '```');
        return;
      case 'horizontalRule':
        lines.push('---');
        return;
      case 'table':
        (node.content ?? []).forEach((row) => {
          const cells = (row.content ?? []).map((c) => inlineText(c).trim());
          lines.push('| ' + cells.join(' | ') + ' |');
        });
        return;
      default:
        (node.content ?? []).forEach((c) => walk(c, depth));
    }
  };
  (editor.state.doc.toJSON().content ?? []).forEach((n: PMNode) => walk(n, 0));
  return lines.join('\n');
}

interface TNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

const para = (text: string): TNode => ({
  type: 'paragraph',
  content: text ? [{ type: 'text', text }] : undefined,
});

/** Markdown 风格标记文本 → Tiptap JSON doc */
export function markdownToDoc(md: string): { type: 'doc'; content: TNode[] } {
  const lines = md.replace(/\r/g, '').split('\n');
  const out: TNode[] = [];
  let i = 0;

  const textOf = (s: string) => s.trim();

  while (i < lines.length) {
    const line = lines[i];

    // 代码块
    if (/^```/.test(line.trim())) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) buf.push(lines[i++]);
      i++; // 跳过收尾 ```
      out.push({ type: 'codeBlock', content: [{ type: 'text', text: buf.join('\n') }] });
      continue;
    }

    // 标题
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = Math.min(h[1].length, 3);
      out.push({ type: 'heading', attrs: { level }, content: [{ type: 'text', text: textOf(h[2]) }] });
      i++;
      continue;
    }

    // 分割线
    if (/^(-{3,}|━{3,}|={3,})$/.test(line.trim())) {
      out.push({ type: 'horizontalRule' });
      i++;
      continue;
    }

    // 引用块（连续 > 行合并）
    if (/^>\s?/.test(line.trim())) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) buf.push(lines[i++].trim().replace(/^>\s?/, ''));
      out.push({ type: 'blockquote', content: buf.map((t) => para(t)) });
      continue;
    }

    // 任务列表
    if (/^\s*- \[[ xX]\]\s*/.test(line)) {
      const items: TNode[] = [];
      while (i < lines.length && /^\s*- \[[ xX]\]\s*/.test(lines[i])) {
        const m = lines[i].match(/^\s*- \[([ xX])\]\s*(.*)$/)!;
        items.push({
          type: 'taskItem',
          attrs: { checked: m[1].toLowerCase() === 'x' },
          content: [para(m[2])],
        });
        i++;
      }
      out.push({ type: 'taskList', content: items });
      continue;
    }

    // 无序列表
    if (/^\s*[-•]\s+/.test(line)) {
      const items: TNode[] = [];
      while (i < lines.length && /^\s*[-•]\s+/.test(lines[i])) {
        items.push({ type: 'listItem', content: [para(lines[i].replace(/^\s*[-•]\s+/, ''))] });
        i++;
      }
      out.push({ type: 'bulletList', content: items });
      continue;
    }

    // 有序列表
    if (/^\s*\d+[.、]\s*/.test(line)) {
      const items: TNode[] = [];
      while (i < lines.length && /^\s*\d+[.、]\s*/.test(lines[i])) {
        items.push({ type: 'listItem', content: [para(lines[i].replace(/^\s*\d+[.、]\s*/, ''))] });
        i++;
      }
      out.push({ type: 'orderedList', content: items });
      continue;
    }

    // 表格（markdown 管道）
    if (line.includes('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|')) {
        const l = lines[i].trim();
        if (!/^\|?[\s:|-]+\|[\s:|-]*$/.test(l) || !/^[\s:|-]+$/.test(l.replace(/\|/g, ''))) {
          const cells = l.replace(/^\|/, '').replace(/\|$/, '').split('|').map((s) => s.trim());
          if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        }
        i++;
      }
      if (rows.length >= 2) {
        const [head, ...body] = rows;
        out.push({
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: head.map((c) => ({
                type: 'tableHeader',
                content: [para(c)],
              })),
            },
            ...body.map((r) => ({
              type: 'tableRow',
              content: r.map((c) => ({ type: 'tableCell', content: [para(c)] })),
            })),
          ],
        });
      }
      continue;
    }

    // 普通段落（跳过空行）
    if (line.trim()) out.push(para(line.trim()));
    i++;
  }

  return { type: 'doc', content: out.length ? out : [para('')] };
}
