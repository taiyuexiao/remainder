/**
 * 壳层通用 SVG 图标（M40 壳层现代化）：24px viewBox 线性风格，与 editor2/icons 同一气质，
 * 替换文档树 / 主导航里的系统 emoji。消费方 `import { IconFolder, IconFile } from './NavIcons'`
 */
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

/* ---------- 文件树 ---------- */

export const IconFolder = (p: P) => (
  <S {...p}>
    <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
  </S>
)

export const IconFolderOpen = (p: P) => (
  <S {...p}>
    <path d="M4 20h16.4a1.6 1.6 0 0 0 1.57-1.92l-1.2-6A1.6 1.6 0 0 0 19.2 10.8H4" />
    <path d="M4 20a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.93a2 2 0 0 1 1.67.9l.8 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v3.8" />
  </S>
)

export const IconFile = (p: P) => (
  <S {...p}>
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2Z" />
    <path d="M14 2v6h6" />
  </S>
)

export const IconChevronRight = (p: P) => (
  <S {...p}>
    <path d="m9 18 6-6-6-6" />
  </S>
)

export const IconChevronLeft = (p: P) => (
  <S {...p}>
    <path d="m15 18-6-6 6-6" />
  </S>
)

export const IconChevronDown = (p: P) => (
  <S {...p}>
    <path d="m6 9 6 6 6-6" />
  </S>
)

export const IconPlus = (p: P) => (
  <S {...p}>
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </S>
)

export const IconPencil = (p: P) => (
  <S {...p}>
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
  </S>
)

export const IconTrash = (p: P) => (
  <S {...p}>
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </S>
)

export const IconClose = (p: P) => (
  <S {...p}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </S>
)

export const IconImport = (p: P) => (
  <S {...p}>
    <path d="M12 3v12" />
    <path d="m7 10 5 5 5-5" />
    <path d="M5 21h14" />
  </S>
)

export const IconSparkles = (p: P) => (
  <S {...p}>
    <path d="M12 3.5l1.9 5.2a2 2 0 0 0 1.2 1.2l5.2 1.9-5.2 1.9a2 2 0 0 0-1.2 1.2L12 20.1l-1.9-5.2a2 2 0 0 0-1.2-1.2L3.7 11.8l5.2-1.9a2 2 0 0 0 1.2-1.2Z" />
    <circle cx="19" cy="19.5" r="1.4" />
  </S>
)

/* ---------- 主导航 ---------- */

export const IconSun = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2" />
    <path d="M12 20v2" />
    <path d="m4.93 4.93 1.41 1.41" />
    <path d="m17.66 17.66 1.41 1.41" />
    <path d="M2 12h2" />
    <path d="M20 12h2" />
    <path d="m6.34 17.66-1.41 1.41" />
    <path d="m19.07 4.93-1.41 1.41" />
  </S>
)

export const IconBot = (p: P) => (
  <S {...p}>
    <rect x="4" y="8" width="16" height="12" rx="2" />
    <path d="M12 8V4" />
    <path d="M9 4h6" />
    <path d="M9 13h.01" />
    <path d="M15 13h.01" />
    <path d="M9.5 16.5h5" />
  </S>
)

export const IconCalendarNav = (p: P) => (
  <S {...p}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M8 2v4" />
    <path d="M16 2v4" />
    <path d="M3 10h18" />
  </S>
)

export const IconMap = (p: P) => (
  <S {...p}>
    <path d="m9 3-6 2v16l6-2 6 2 6-2V3l-6 2-6-2Z" />
    <path d="M9 3v16" />
    <path d="M15 5v16" />
  </S>
)

export const IconClipboardList = (p: P) => (
  <S {...p}>
    <rect x="5" y="4" width="14" height="18" rx="2" />
    <path d="M9 2h6v4H9z" />
    <path d="M9 11h6" />
    <path d="M9 15h6" />
  </S>
)

export const IconMessage = (p: P) => (
  <S {...p}>
    <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 8.5-8.5c4.7 0 8.5 3.8 8.5 8.5Z" />
  </S>
)

export const IconLightbulb = (p: P) => (
  <S {...p}>
    <path d="M9 18h6" />
    <path d="M10 22h4" />
    <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.4 1 2.3h6c0-.9.4-1.8 1-2.3A7 7 0 0 0 12 2Z" />
  </S>
)

export const IconPaperclip = (p: P) => (
  <S {...p}>
    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </S>
)

export const IconUsers = (p: P) => (
  <S {...p}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </S>
)

export const IconBarChart = (p: P) => (
  <S {...p}>
    <path d="M3 21h18" />
    <path d="M7 21V10" />
    <path d="M12 21V3" />
    <path d="M17 21v-8" />
  </S>
)

export const IconPalette = (p: P) => (
  <S {...p}>
    <path d="M12 22a10 10 0 1 1 10-10c0 1.7-1.3 3-3 3h-2.2a2 2 0 0 0-1.5 3.3c.4.5.7.9.7 1.7a2 2 0 0 1-2 2Z" />
    <circle cx="7.5" cy="11.5" r="1" />
    <circle cx="10.5" cy="7.5" r="1" />
    <circle cx="15.5" cy="7.5" r="1" />
    <circle cx="17.5" cy="11.5" r="1" />
  </S>
)

export const IconSettings = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3" />
    <path d="M12 19v3" />
    <path d="M4.2 4.2l2.1 2.1" />
    <path d="m17.7 17.7 2.1 2.1" />
    <path d="M2 12h3" />
    <path d="M19 12h3" />
    <path d="m4.2 19.8 2.1-2.1" />
    <path d="m17.7 6.3 2.1-2.1" />
  </S>
)

export const IconLogout = (p: P) => (
  <S {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5" />
    <path d="M21 12H9" />
  </S>
)

export const IconSync = (p: P) => (
  <S {...p}>
    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
    <path d="M21 3v6h-6" />
  </S>
)

export const IconZap = (p: P) => (
  <S {...p}>
    <path d="M13 2 4.6 12.4a0.6 0.6 0 0 0 0.46 0.98H11l-1 8.62 8.4-10.4a0.6 0.6 0 0 0-0.46-0.98H13l1-8.62Z" />
  </S>
)

/** 发送三角（实心，微微上扬 18°）——AI 助手输入区发送按钮 */
export const IconSend = (p: P) => (
  <S {...p}>
    <g transform="rotate(-18 12 12)">
      <path
        d="M4.5 4.7v14.6a1 1 0 0 0 1.54.84l13.1-7.3a1 1 0 0 0 0-1.68L6.04 3.86A1 1 0 0 0 4.5 4.7Z"
        fill="currentColor"
        stroke="none"
      />
    </g>
  </S>
)
