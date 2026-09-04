/**
 * 飞书式斜杠命令菜单（M14 实现 / M15 UI 照抄飞书）：
 * 输入 "/"（行首或空格后）弹出块类型菜单
 * - 分组小标题（文本/列表/插入）、彩色图标方块 + 单行标签
 * - 继续输入过滤（中文/拼音/英文）、↑↓ 选择、Enter 执行、Esc 关闭、鼠标点击
 */
import { Extension, type Editor, type Range } from '@tiptap/core';
import { Suggestion, type SuggestionProps, type SuggestionKeyDownProps } from '@tiptap/suggestion';
import { parseTableText, rowsToTableHtml } from './tableDetect';

export interface SlashItem {
  title: string;
  group: '基础' | '常用' | '插入';
  icon: string;
  iconColor: string; // 飞书式：纯色线条图标（无底块）
  keywords: string[];
  command: (editor: Editor, range: Range) => void;
}

const SLASH_ITEMS: SlashItem[] = [
  {
    title: '正文', group: '基础', icon: 'T', iconColor: '#3370ff', keywords: ['text', 'zw', 'zhengwen', 'plain'],
    command: (e, r) => e.chain().focus().deleteRange(r).setParagraph().run(),
  },
  {
    title: '标题 1', group: '基础', icon: 'H1', iconColor: '#3370ff', keywords: ['h1', 'bt', 'biaoti', 'heading1'],
    command: (e, r) => e.chain().focus().deleteRange(r).setNode('heading', { level: 1 }).run(),
  },
  {
    title: '标题 2', group: '基础', icon: 'H2', iconColor: '#3370ff', keywords: ['h2', 'bt', 'biaoti', 'heading2'],
    command: (e, r) => e.chain().focus().deleteRange(r).setNode('heading', { level: 2 }).run(),
  },
  {
    title: '标题 3', group: '基础', icon: 'H3', iconColor: '#3370ff', keywords: ['h3', 'bt', 'biaoti', 'heading3'],
    command: (e, r) => e.chain().focus().deleteRange(r).setNode('heading', { level: 3 }).run(),
  },
  {
    title: '有序列表', group: '基础', icon: '≣', iconColor: '#7f6bf5', keywords: ['ordered', 'ol', 'yx', 'youxu', 'number'],
    command: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run(),
  },
  {
    title: '无序列表', group: '基础', icon: '≡', iconColor: '#7f6bf5', keywords: ['bullet', 'ul', 'wx', 'wuxu', 'liebiao'],
    command: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run(),
  },
  {
    title: '代码块', group: '基础', icon: '{ }', iconColor: '#34c07c', keywords: ['code', 'dm', 'daima'],
    command: (e, r) => e.chain().focus().deleteRange(r).toggleCodeBlock().run(),
  },
  {
    title: '引用', group: '基础', icon: '❝', iconColor: '#3370ff', keywords: ['quote', 'yy', 'yinyong'],
    command: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run(),
  },
  {
    title: '分隔线', group: '基础', icon: '―', iconColor: '#f79009', keywords: ['hr', 'divider', 'fgx', 'fengexian'],
    command: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run(),
  },
  {
    title: '链接', group: '基础', icon: '🔗', iconColor: '#3370ff', keywords: ['link', 'url', 'lj', 'lianjie'],
    command: (e, r) => {
      const url = window.prompt('链接地址（https://…）');
      if (!url?.trim()) return;
      e.chain().focus().deleteRange(r).extendMarkRange('link').setLink({ href: url.trim() }).run();
    },
  },
  {
    title: '任务', group: '常用', icon: '☑', iconColor: '#7f6bf5', keywords: ['todo', 'db', 'daiban', 'task'],
    command: (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run(),
  },
  {
    title: '图片', group: '常用', icon: '🖼', iconColor: '#f79009', keywords: ['image', 'img', 'tp', 'tupian'],
    command: (e, r) => {
      const url = window.prompt('图片链接（https://…）');
      if (url?.trim()) e.chain().focus().deleteRange(r).setImage({ src: url.trim() }).run();
    },
  },
  {
    title: '表格', group: '常用', icon: '▦', iconColor: '#14b8a6', keywords: ['table', 'bg', 'biaoge'],
    command: (e, r) => e.chain().focus().deleteRange(r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    title: '文本转表格', group: '插入', icon: '⇥', iconColor: '#7f6bf5', keywords: ['tableify', 'zhb', 'zhuanbiaoge'],
    command: (e, r) => {
      e.chain().focus().deleteRange(r).run();
      const { from, to } = e.state.selection;
      const text = e.state.doc.textBetween(from, to, '\n', '\n');
      const rows = parseTableText(text);
      if (rows) {
        e.chain().focus().deleteSelection().insertContent(rowsToTableHtml(rows)).run();
      } else {
        alert('没有识别到表格结构（需 ≥3 行、Tab/多列空格/管道符分列）');
      }
    },
  },
];

const GROUP_ORDER = ['基础', '常用', '插入'] as const;

const filterItems = (query: string): SlashItem[] => {
  const q = query.trim().toLowerCase();
  if (!q) return SLASH_ITEMS;
  return SLASH_ITEMS.filter(
    (i) => i.title.replace(/\s/g, '').includes(query.trim()) || i.keywords.some((k) => k.includes(q)),
  );
};

/** 弹层 DOM 管理（原生 DOM，飞书式分组渲染） */
class SlashPopup {
  private el: HTMLDivElement | null = null;
  private items: SlashItem[] = [];
  private selected = 0;
  private props: SuggestionProps<SlashItem> | null = null;

  start(props: SuggestionProps<SlashItem>) {
    this.el = document.createElement('div');
    this.el.className = 'slash-menu';
    document.body.appendChild(this.el);
    this.update(props);
  }

  update(props: SuggestionProps<SlashItem>) {
    this.props = props;
    this.items = props.items;
    if (this.selected >= this.items.length) this.selected = 0;
    this.render();
    this.reposition();
  }

  keyDown({ event }: SuggestionKeyDownProps): boolean {
    if (event.key === 'ArrowUp') {
      this.selected = (this.selected - 1 + this.items.length) % Math.max(this.items.length, 1);
      this.render();
      return true;
    }
    if (event.key === 'ArrowDown') {
      this.selected = (this.selected + 1) % Math.max(this.items.length, 1);
      this.render();
      return true;
    }
    if (event.key === 'Enter') {
      const item = this.items[this.selected];
      if (item && this.props) this.props.command(item);
      return true;
    }
    if (event.key === 'Escape') return true; // suggestion 插件会自行关闭
    return false;
  }

  exit() {
    this.el?.remove();
    this.el = null;
  }

  private reposition() {
    if (!this.el || !this.props?.clientRect) return;
    const rect = this.props.clientRect();
    if (!rect) return;
    const top = Math.min(rect.bottom + 6, window.innerHeight - this.el.offsetHeight - 8);
    const left = Math.min(rect.left, window.innerWidth - this.el.offsetWidth - 8);
    this.el.style.top = `${top}px`;
    this.el.style.left = `${left}px`;
  }

  private render() {
    if (!this.el) return;
    if (this.items.length === 0) {
      this.el.innerHTML = '<div class="slash-empty">无匹配项</div>';
      return;
    }
    // 按分组渲染（过滤后只显示非空分组）
    let html = '';
    let idx = 0;
    for (const group of GROUP_ORDER) {
      const groupItems = this.items.filter((i) => i.group === group);
      if (groupItems.length === 0) continue;
      html += `<div class="slash-group">${group}</div>`;
      for (const it of groupItems) {
        const globalIdx = this.items.indexOf(it);
        html += `
          <button class="slash-item ${globalIdx === this.selected ? 'active' : ''}" data-idx="${globalIdx}">
            <span class="slash-icon" style="color:${it.iconColor}">${it.icon}</span>
            <span class="slash-title">${it.title}</span>
          </button>`;
        idx++;
      }
    }
    this.el.innerHTML = html;
    this.el.querySelectorAll<HTMLButtonElement>('.slash-item').forEach((btn) => {
      btn.onmousedown = (e) => {
        e.preventDefault(); // 保持编辑器焦点
        const item = this.items[Number(btn.dataset.idx)];
        if (item && this.props) this.props.command(item);
      };
      btn.onmouseenter = () => {
        this.selected = Number(btn.dataset.idx);
        this.el?.querySelectorAll('.slash-item').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      };
    });
    // 键盘选中项滚入视野
    this.el.querySelector('.slash-item.active')?.scrollIntoView({ block: 'nearest' });
  }
}

export const SlashCommand = Extension.create({
  name: 'slashCommand',
  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        char: '/',
        startOfLine: false,
        items: ({ query }) => filterItems(query),
        // 选中项后由插件调回：执行条目自带命令（删除 "/查询词" 再变换块）
        command: ({ editor, range, props: item }) => {
          item.command(editor, range);
        },
        render: () => {
          const popup = new SlashPopup();
          return {
            onStart: (props) => popup.start(props),
            onUpdate: (props) => popup.update(props),
            onKeyDown: (props) => popup.keyDown(props),
            onExit: () => popup.exit(),
          };
        },
      }),
    ];
  },
});
