/**
 * 色板定义 — 设计规范 §2.1（文字色板 9 色 / 高亮色板 7 色）
 * 单一数据源，供 Toolbar / BubbleToolbar / pickers 共用
 */
export interface TextColor {
  name: string
  color: string // '' 表示默认色（继承正文色）
}

export interface HighlightColor {
  name: string
  color: string
}

/** 文字颜色：默认 / 灰 / 红 / 橙 / 黄 / 绿 / 蓝 / 紫 / 粉 */
export const TEXT_COLORS: TextColor[] = [
  { name: '默认', color: '' },
  { name: '灰色', color: '#8F959E' },
  { name: '红色', color: '#F54A45' },
  { name: '橙色', color: '#FF8800' },
  { name: '黄色', color: '#FAAD14' },
  { name: '绿色', color: '#34A853' },
  { name: '蓝色', color: '#3370FF' },
  { name: '紫色', color: '#7F3BF5' },
  { name: '粉色', color: '#F5319D' },
]

/** 高亮底色：黄 / 绿 / 蓝 / 紫 / 粉 / 橙 / 灰 */
export const HIGHLIGHT_COLORS: HighlightColor[] = [
  { name: '黄色', color: '#FFF1B8' },
  { name: '绿色', color: '#D3F261' },
  { name: '蓝色', color: '#D6E4FF' },
  { name: '紫色', color: '#EADCFF' },
  { name: '粉色', color: '#FFD6E7' },
  { name: '橙色', color: '#FFE7BA' },
  { name: '灰色', color: '#F0F1F2' },
]
