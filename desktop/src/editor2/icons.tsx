// 自绘 SVG 图标库（24px viewBox，线性风格，近似飞书图标气质，非复制素材）
// 命名约定：统一 Icon* 前缀，消费方 `import * as I from './icons'`
import type { ReactNode, SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { size?: number }

function S({ size = 16, children, ...rest }: P & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  )
}

function F({ size = 16, children, ...rest }: P & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none" {...rest}>
      {children}
    </svg>
  )
}

/* ---------- 方向 / 状态 ---------- */

export const IconBack = (p: P) => <S {...p}><path d="M15 18l-6-6 6-6" /></S>
export const IconChevronDown = (p: P) => <S {...p}><path d="M6 9l6 6 6-6" /></S>
export const IconChevronRight = (p: P) => <S {...p}><path d="M9 6l6 6-6 6" /></S>
export const IconCheck = (p: P) => <S {...p}><path d="M5 13l4 4L19 7" /></S>
export const IconClose = (p: P) => <S {...p}><path d="M6 6l12 12M18 6L6 18" /></S>
export const IconPlus = (p: P) => <S {...p}><path d="M12 5v14M5 12h14" /></S>
export const IconMinus = (p: P) => <S {...p}><path d="M5 12h14" /></S>
export const IconSearch = (p: P) => (
  <S {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20.5 20.5L16 16" />
  </S>
)

export const IconStar = ({ filled, ...p }: P & { filled?: boolean }) =>
  filled ? (
    <F {...p}>
      <path d="M12 17.27l-5.15 3.05 1.35-5.85-4.5-3.9 5.95-.52L12 4.5l2.35 5.55 5.95.52-4.5 3.9 1.35 5.85z" />
    </F>
  ) : (
    <S {...p}>
      <path d="M12 17.27l-5.15 3.05 1.35-5.85-4.5-3.9 5.95-.52L12 4.5l2.35 5.55 5.95.52-4.5 3.9 1.35 5.85z" />
    </S>
  )
export const IconStarFill = (p: P) => <IconStar {...p} filled />

export const IconHistory = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.2 1.9" />
  </S>
)

export const IconMore = (p: P) => (
  <F {...p}>
    <circle cx="5" cy="12" r="1.7" />
    <circle cx="12" cy="12" r="1.7" />
    <circle cx="19" cy="12" r="1.7" />
  </F>
)

export const IconDrag = (p: P) => (
  <F {...p}>
    {[6, 12, 18].map((y) =>
      [9, 15].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.35" />),
    )}
  </F>
)

/* ---------- 撤销 / 重做 ---------- */

export const IconUndo = (p: P) => (
  <S {...p}>
    <path d="M8 5L3 10l5 5" />
    <path d="M3 10h11a6 6 0 016 6v1" />
  </S>
)

export const IconRedo = (p: P) => (
  <S {...p}>
    <path d="M16 5l5 5-5 5" />
    <path d="M21 10H10a6 6 0 00-6 6v1" />
  </S>
)

/* ---------- 行内样式 ---------- */

export const IconBold = (p: P) => (
  <S {...p}>
    <path d="M7 5h5.5a3.25 3.25 0 010 6.5H7z" />
    <path d="M7 11.5h6.5a3.25 3.25 0 010 6.5H7z" />
  </S>
)

export const IconItalic = (p: P) => (
  <S {...p}>
    <path d="M10 5h8" />
    <path d="M6 19h8" />
    <path d="M14.5 5l-5 14" />
  </S>
)

export const IconUnderline = (p: P) => (
  <S {...p}>
    <path d="M7 4v6a5 5 0 0010 0V4" />
    <path d="M5.5 20h13" />
  </S>
)

export const IconStrike = (p: P) => (
  <S {...p}>
    <path d="M4.5 12h15" />
    <path d="M8.5 8a3.5 3.5 0 017 0c0 2.2-2.5 4-7 5.5" />
    <path d="M15.5 16a3.5 3.5 0 01-7 0" />
  </S>
)

export const IconCode = (p: P) => (
  <S {...p}>
    <path d="M8.5 7L4 12l4.5 5" />
    <path d="M15.5 7L20 12l-4.5 5" />
  </S>
)
/** 别名：行内代码 */
export const IconInlineCode = IconCode

export const IconCodeBlock = (p: P) => (
  <S {...p}>
    <rect x="3" y="4.5" width="18" height="15" rx="2" />
    <path d="M9.5 10.5L7 12.5l2.5 2" />
    <path d="M14.5 10.5l2.5 2-2.5 2" />
  </S>
)

export const IconFontColor = (p: P) => (
  <S {...p}>
    <path d="M6.5 15L11 5h1l4.5 10" />
    <path d="M8.4 11.5h6.4" />
    <path d="M5 20h14" strokeWidth={2.4} />
  </S>
)

export const IconHighlight = (p: P) => (
  <S {...p}>
    <path d="M14.5 4.5l5 5L11 18H6.5v-4.5z" />
    <path d="M4 21h16" strokeWidth={2.4} />
  </S>
)

export const IconLink = (p: P) => (
  <S {...p}>
    <path d="M10.2 13.8a4.2 4.2 0 005.94 0l2.86-2.86a4.2 4.2 0 00-5.94-5.94l-1.2 1.2" />
    <path d="M13.8 10.2a4.2 4.2 0 00-5.94 0L5 13.06a4.2 4.2 0 005.94 5.94l1.2-1.2" />
  </S>
)
/** 别名：链接 */
export const IconLinkIcon = IconLink

export const IconAlignLeft = (p: P) => <S {...p}><path d="M4 6h16M4 12h10M4 18h13" /></S>
export const IconAlignCenter = (p: P) => <S {...p}><path d="M4 6h16M7 12h10M6 18h12" /></S>
export const IconAlignRight = (p: P) => <S {...p}><path d="M4 6h16M10 12h10M7 18h13" /></S>

/* ---------- 块类型 ---------- */

export const IconTextT = (p: P) => (
  <S {...p}>
    <path d="M5 6.5V5h14v1.5" />
    <path d="M12 5v14" />
  </S>
)

export const IconBulletList = (p: P) => (
  <S {...p}>
    <circle cx="4.5" cy="6.5" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="17.5" r="1.4" fill="currentColor" stroke="none" />
    <path d="M9.5 6.5H20M9.5 12H20M9.5 17.5H20" />
  </S>
)

export const IconOrderedList = (p: P) => (
  <S {...p}>
    <path d="M10 6.5H20M10 12H20M10 17.5H20" />
    <text x="3" y="8.5" fontSize="7.5" fill="currentColor" stroke="none" fontWeight="600">1</text>
    <text x="3" y="14" fontSize="7.5" fill="currentColor" stroke="none" fontWeight="600">2</text>
    <text x="3" y="19.5" fontSize="7.5" fill="currentColor" stroke="none" fontWeight="600">3</text>
  </S>
)

export const IconTodoList = (p: P) => (
  <S {...p}>
    <rect x="3.5" y="4.5" width="6.5" height="6.5" rx="1.5" />
    <path d="M5.2 7.8l1.6 1.6L9.7 6" />
    <path d="M13.5 7.5H21M13.5 17H21" />
    <rect x="3.5" y="14" width="6.5" height="6.5" rx="1.5" />
  </S>
)

export const IconQuote = (p: P) => (
  <S {...p}>
    <path d="M10 7H6.5A2.5 2.5 0 004 9.5V12h4a2 2 0 012 2v1a2.5 2.5 0 01-2.5 2.5" />
    <path d="M20 7h-3.5A2.5 2.5 0 0014 9.5V12h4a2 2 0 012 2v1a2.5 2.5 0 01-2.5 2.5" />
  </S>
)

export const IconDivider = (p: P) => <S {...p}><path d="M4 12h16" /></S>

export const IconTable = (p: P) => (
  <S {...p}>
    <rect x="3.5" y="5" width="17" height="14" rx="1.5" />
    <path d="M3.5 10.2h17M9.5 10.2V19M15.5 10.2V19" />
  </S>
)

export const IconImage = (p: P) => (
  <S {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <circle cx="8.7" cy="9.7" r="1.6" />
    <path d="M5.5 17.5l4.5-4.5 3 3 2.5-2.5 3.5 3.5" />
  </S>
)

/** 高亮块：对话气泡+感叹 */
export const IconCallout = (p: P) => (
  <S {...p}>
    <path d="M4 5h16v11.5H10L4.5 21V5z" />
    <path d="M12 8.2v3" />
    <circle cx="12" cy="13.6" r="0.9" fill="currentColor" stroke="none" />
  </S>
)

export const IconHeading = ({ level, ...p }: P & { level: number }) => (
  <span
    style={{
      fontSize: 12,
      fontWeight: 700,
      fontFamily: 'Menlo, monospace',
      lineHeight: 1,
      display: 'inline-flex',
      alignItems: 'center',
    }}
    {...(p as object)}
  >
    H{level}
  </span>
)

/* ---------- 导航 / 文件 ---------- */

export const IconHome = (p: P) => (
  <S {...p}><path d="M4 11l8-7.5L20 11v9.5h-5.5v-6h-5v6H4z" /></S>
)

export const IconFolder = (p: P) => (
  <S {...p}><path d="M3 6.5l2.5-2.5h5l2 2.5h8.5v13H3z" /></S>
)

export const IconUsers = (p: P) => (
  <S {...p}>
    <circle cx="9" cy="8.5" r="3.5" />
    <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
    <path d="M16 5.5a3.2 3.2 0 010 6.4M17.5 14.8c2 .7 3.5 2.4 3.5 4.7" />
  </S>
)

export const IconBook = (p: P) => (
  <S {...p}>
    <path d="M4 5.5A2.5 2.5 0 016.5 3H20v18H6.5A2.5 2.5 0 014 18.5z" />
    <path d="M4 18.5A2.5 2.5 0 016.5 16H20" />
  </S>
)

export const IconTrash = (p: P) => (
  <S {...p}>
    <path d="M4 7h16" />
    <path d="M9.5 7V4.5h5V7" />
    <path d="M6 7l1 13.5h10L18 7" />
    <path d="M10 11v6M14 11v6" />
  </S>
)

export const IconDoc = (p: P) => (
  <S {...p}>
    <path d="M7 3.5h6.5L18 8v12.5H7z" />
    <path d="M13.5 3.5V8H18" />
    <path d="M9.5 12h5M9.5 15.5h5" />
  </S>
)

export const IconList = (p: P) => (
  <S {...p}><path d="M4 6h2.2M4 12h2.2M4 18h2.2M9.5 6H20M9.5 12H20M9.5 18H20" /></S>
)

export const IconComment = (p: P) => (
  <S {...p}><path d="M4 5h16v11.5H10L4.5 21V5z" transform="translate(0 -0.5)" /></S>
)

export const IconEye = (p: P) => (
  <S {...p}>
    <path d="M2.5 12S6.5 5.5 12 5.5 21.5 12 21.5 12 17.5 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="3" />
  </S>
)

export const IconPencil = (p: P) => (
  <S {...p}>
    <path d="M4 20h4.5L20.5 8 16 3.5 4 15.5z" />
    <path d="M13.5 6l4.5 4.5" />
  </S>
)

export const IconCopy = (p: P) => (
  <S {...p}>
    <rect x="9" y="9" width="11" height="11" rx="1.5" />
    <path d="M5 15H4.5A1.5 1.5 0 013 13.5v-9A1.5 1.5 0 014.5 3h9A1.5 1.5 0 0115 4.5V5" />
  </S>
)

export const IconAvatar = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="9" r="3.5" />
    <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" />
  </S>
)

/* ---------- 斜杠菜单新增内容块 ---------- */

/** AI 帮我写：四角星光 */
export const IconAI = ({ size = 16, ...p }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none" {...p}>
    <path d="M12 2.5l2.1 5.9a2 2 0 001.2 1.2l5.9 2.1-5.9 2.1a2 2 0 00-1.2 1.2L12 20.9l-2.1-5.9a2 2 0 00-1.2-1.2L2.8 11.7l5.9-2.1a2 2 0 001.2-1.2z" />
    <circle cx="19" cy="19.5" r="1.6" />
  </svg>
)

export const IconSync = (p: P) => (
  <S {...p}>
    <path d="M4.5 9a8 8 0 0114-1.5" />
    <path d="M18.5 4v3.5H15" />
    <path d="M19.5 15a8 8 0 01-14 1.5" />
    <path d="M5.5 20v-3.5H9" />
  </S>
)

export const IconColumns = (p: P) => (
  <S {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="M9.2 4.5v15M14.8 4.5v15" />
  </S>
)

export const IconFormula = (p: P) => (
  <S {...p}>
    <path d="M5 19c2.5 0 3-14 6.5-14 2 0 2.2 2.6.6 3.6" />
    <path d="M4 11.5h8" />
    <path d="M14.5 12l5 6.5M19.5 12l-5 6.5" />
  </S>
)

export const IconTemplate = (p: P) => (
  <S {...p}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
    <path d="M3.5 9h17M9.5 9v11.5" />
  </S>
)

export const IconFileMedia = (p: P) => (
  <S {...p}>
    <path d="M13.5 3.5H7A1.5 1.5 0 005.5 5v14A1.5 1.5 0 007 20.5h10a1.5 1.5 0 001.5-1.5V8.5z" />
    <path d="M13.5 3.5V8.5H18.5" />
    <path d="M10.5 12l4 2.3-4 2.3z" />
  </S>
)

export const IconVote = (p: P) => (
  <S {...p}>
    <path d="M4 20V10M10 20V4M16 20v-7M21 20H3" />
  </S>
)

export const IconBell = (p: P) => (
  <S {...p}>
    <path d="M6 10a6 6 0 0112 0c0 5 2 6 2 6H4s2-1 2-6" />
    <path d="M10 19a2 2 0 004 0" />
  </S>
)

export const IconClipboard = (p: P) => (
  <S {...p}>
    <rect x="5" y="5" width="14" height="16" rx="2" />
    <path d="M9 5a3 3 0 016 0" />
    <path d="M8.5 12l2 2 4.5-4.5" />
  </S>
)

export const IconCalendar = (p: P) => (
  <S {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <path d="M3.5 10h17M8 2.5V7M16 2.5V7" />
  </S>
)

export const IconAgenda = (p: P) => (
  <S {...p}>
    <rect x="4" y="3.5" width="16" height="17" rx="2" />
    <path d="M8 8.5h8M8 12.5h8M8 16.5h4.5" />
  </S>
)

export const IconScissors = (p: P) => (
  <S {...p}>
    <circle cx="6.5" cy="7" r="2.5" />
    <circle cx="6.5" cy="17" r="2.5" />
    <path d="M8.6 8.6L19 18M8.6 15.4L19 6" />
  </S>
)

export const IconIndentIn = (p: P) => (
  <S {...p}>
    <path d="M10 6h10M10 12h10M10 18h10" />
    <path d="M4 9.5L7 12l-3 2.5" />
  </S>
)

export const IconIndentOut = (p: P) => (
  <S {...p}>
    <path d="M10 6h10M10 12h10M10 18h10" />
    <path d="M7 9.5L4 12l3 2.5" />
  </S>
)

export const IconChecklist = (p: P) => (
  <S {...p}>
    <path d="M4.5 6l1.4 1.4L8.5 4.8M4.5 12l1.4 1.4 2.6-2.6M4.5 18l1.4 1.4 2.6-2.6" />
    <path d="M12 6.5h8M12 12.5h8M12 18.5h8" />
  </S>
)

/** 一键排版：魔法棒 */
export const IconMagic = (p: P) => (
  <S {...p}>
    <path d="M4.5 19.5L15 9" />
    <path d="M13.2 7.2l3.6 3.6" />
    <path d="M17.5 3.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" />
    <path d="M7 4l.6 1.4L9 6l-1.4.6L7 8l-.6-1.4L5 6l1.4-.6z" />
  </S>
)

/** 解释：圆形问号 */
export const IconHelp = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9.6 9.3a2.5 2.5 0 114.2 1.9c-.8.7-1.8 1.2-1.8 2.4" />
    <circle cx="12" cy="16.6" r="0.9" fill="currentColor" stroke="none" />
  </S>
)

/** 收起面板：双箭头向左 */
export const IconCollapseLeft = (p: P) => (
  <S {...p}>
    <path d="M12.5 6l-6 6 6 6" />
    <path d="M18.5 6l-6 6 6 6" />
  </S>
)

/** 自动换行 */
export const IconWrap = (p: P) => (
  <S {...p}>
    <path d="M4 6h16M4 12h12a3.5 3.5 0 010 7h-3" />
    <path d="M15.5 16.5L13 19l2.5 2.5" />
    <path d="M4 18h4" />
  </S>
)

/** 图片放大预览：缩放 */
export const IconZoomIn = (p: P) => (
  <S {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20.5 20.5L16 16M11 8.5v5M8.5 11h5" />
  </S>
)

export const IconZoomOut = (p: P) => (
  <S {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20.5 20.5L16 16M8.5 11h5" />
  </S>
)

/** 下载 */
export const IconDownload = (p: P) => (
  <S {...p}>
    <path d="M12 4v10M8 10.5l4 4 4-4" />
    <path d="M5 19h14" />
  </S>
)

export const IconLogo = ({ size = 24, ...p }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...p}>
    <rect x="1" y="1" width="22" height="22" rx="6" fill="#3370FF" />
    <path
      d="M6.5 14.5L17.5 6l-4 9.5-2.2-2.2-1.8 3.2z"
      fill="#fff"
      stroke="#fff"
      strokeWidth="1"
      strokeLinejoin="round"
    />
  </svg>
)
