/** Markdown → Tiptap JSON 简版转换器（reports 路由与 standup-agent 集成共用，M35）
 *  支持：# ~ ### 标题、- / * 无序列表、**粗体** 内联标记（生成 bold mark，不剥掉）
 *  输出永远是合法 Tiptap JSON 字符串（前端 JSON.parse 失败会回退空文档，见 AGENTS.md 坑 16） */

interface TiptapMark {
  type: string;
}

interface TiptapText {
  type: 'text';
  text: string;
  marks?: TiptapMark[];
}

/** 把一段含 **粗体** 的文本拆成 text 节点序列 */
function parseInline(text: string): TiptapText[] {
  const out: TiptapText[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index) });
    out.push({ type: 'text', text: m[1], marks: [{ type: 'bold' }] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  return out.length ? out : [{ type: 'text', text: '' }];
}

export function mdToTiptapJson(md: string): string {
  const nodes: Record<string, unknown>[] = [];
  let list: TiptapText[][] | null = null;
  const flushList = () => {
    if (list?.length) {
      nodes.push({
        type: 'bulletList',
        content: list.map((inline) => ({
          type: 'listItem',
          content: [{ type: 'paragraph', content: inline }],
        })),
      });
    }
    list = null;
  };
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    if (!line) {
      flushList();
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      flushList();
      nodes.push({
        type: 'heading',
        attrs: { level: h[1].length },
        content: parseInline(h[2]),
      });
      continue;
    }
    const li = line.match(/^[-*]\s+(.*)$/);
    if (li) {
      (list ??= []).push(parseInline(li[1]));
      continue;
    }
    flushList();
    nodes.push({ type: 'paragraph', content: parseInline(line) });
  }
  flushList();
  return JSON.stringify({ type: 'doc', content: nodes.length ? nodes : [{ type: 'paragraph' }] });
}
