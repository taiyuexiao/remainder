/** 共享文本样式扩展（M14/M15）：DocsPage 与 CanvasPage 共用 */
import { Extension } from '@tiptap/core';

/** 字号支持：给 textStyle 标记加 fontSize 属性（工具栏用 setMark 设置） */
export const FontSizeAttr = Extension.create({
  name: 'fontSizeAttr',
  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (el: HTMLElement) => el.style.fontSize || null,
            renderHTML: (attrs: Record<string, string | null>) =>
              attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {},
          },
        },
      },
    ];
  },
});

export const FONT_FAMILIES: [string, string][] = [
  ['默认字体', ''],
  ['宋体', '宋体, SimSun, serif'],
  ['楷体', '楷体, KaiTi, serif'],
  ['黑体', '黑体, SimHei, sans-serif'],
  ['等宽', 'Consolas, monospace'],
];

export const FONT_SIZES: [string, string][] = [
  ['默认', ''],
  ['12px', '12px'],
  ['14px', '14px'],
  ['16px', '16px'],
  ['18px', '18px'],
  ['20px', '20px'],
  ['24px', '24px'],
  ['32px', '32px'],
];
