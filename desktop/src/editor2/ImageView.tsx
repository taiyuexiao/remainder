/**
 * 图片增强（对齐飞书）：
 * - 拖右下角等比缩放（宽度持久化）
 * - 悬浮工具条：居左/居中/居右/删除
 * - 题注（图片下方可编辑说明）
 * - 点击全屏预览（缩放/下载/Esc 关闭）
 * - 粘贴/拖拽图片文件直接上传插入（extensions 里接入 handlePaste/handleDrop）
 */
import { useEffect, useRef, useState } from 'react'
import Image from '@tiptap/extension-image'
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import * as I from './icons'

const MIN_W = 120
const MAX_W = 920

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === '+' || e.key === '=') setScale((s) => Math.min(s + 0.25, 4))
      if (e.key === '-') setScale((s) => Math.max(s - 0.25, 0.25))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fe-lightbox" onClick={onClose}>
      <div className="fe-lightbox-bar" onClick={(e) => e.stopPropagation()}>
        <button title="缩小" onClick={() => setScale((s) => Math.max(s - 0.25, 0.25))}><I.IconZoomOut size={15} /></button>
        <span>{Math.round(scale * 100)}%</span>
        <button title="放大" onClick={() => setScale((s) => Math.min(s + 0.25, 4))}><I.IconZoomIn size={15} /></button>
        <a href={src} download title="下载"><I.IconDownload size={15} /></a>
        <button title="关闭 (Esc)" onClick={onClose}><I.IconClose size={15} /></button>
      </div>
      <img src={src} alt="" style={{ transform: `scale(${scale})` }} onClick={(e) => e.stopPropagation()} />
    </div>
  )
}

function ImageView(props: NodeViewProps) {
  const { node, updateAttributes, deleteNode, selected } = props
  const src = node.attrs.src as string
  const align = (node.attrs.align as string) || 'center'
  const width = (node.attrs.width as number) || 0 // 0 = 自适应
  const caption = (node.attrs.caption as string) || ''
  const [preview, setPreview] = useState(false)
  const [barVisible, setBarVisible] = useState(false)
  const capRef = useRef<HTMLDivElement>(null)

  /** 拖拽缩放：右下角手柄，等比（仅宽度，高度 auto） */
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = (capRef.current?.parentElement?.querySelector('.fe-image-frame img') as HTMLElement)?.getBoundingClientRect().width
      || (node.attrs.width as number) || 400
    const onMove = (ev: MouseEvent) => {
      const w = Math.min(Math.max(startW + (ev.clientX - startX), MIN_W), MAX_W)
      updateAttributes({ width: Math.round(w) })
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const saveCaption = () => {
    const text = capRef.current?.textContent ?? ''
    if (text !== caption) updateAttributes({ caption: text })
  }

  return (
    <NodeViewWrapper className={`fe-image align-${align}`} data-selected={selected ? 'true' : undefined}>
      <div
        className="fe-image-frame"
        style={width ? { width } : undefined}
        onMouseEnter={() => setBarVisible(true)}
        onMouseLeave={() => setBarVisible(false)}
      >
        <img src={src} alt={caption || ''} onClick={() => setPreview(true)} draggable={false} />
        <div className="fe-image-tools" contentEditable={false} style={{ opacity: barVisible || selected ? 1 : 0 }}>
          <button title="居左" onClick={() => updateAttributes({ align: 'left' })}><I.IconAlignLeft size={13} /></button>
          <button title="居中" onClick={() => updateAttributes({ align: 'center' })}><I.IconAlignCenter size={13} /></button>
          <button title="居右" onClick={() => updateAttributes({ align: 'right' })}><I.IconAlignRight size={13} /></button>
          <span className="sep" />
          <button title="删除图片" onClick={() => deleteNode()}><I.IconTrash size={13} /></button>
        </div>
        <span className="fe-image-resize" contentEditable={false} onMouseDown={startResize} title="拖拽调整大小" />
      </div>
      <div
        ref={capRef}
        className="fe-image-caption"
        contentEditable
        suppressContentEditableWarning
        data-placeholder="添加图片说明…"
        onBlur={saveCaption}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLElement).blur() }
          e.stopPropagation()
        }}
      >
        {caption}
      </div>
      {preview && <Lightbox src={src} onClose={() => setPreview(false)} />}
    </NodeViewWrapper>
  )
}

export const FeImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: 'center',
        parseHTML: (el) => el.getAttribute('data-align') || 'center',
        renderHTML: (attrs) => ({ 'data-align': attrs.align }),
      },
      width: {
        default: 0,
        parseHTML: (el) => parseInt(el.getAttribute('data-width') || '0', 10) || 0,
        renderHTML: (attrs) => (attrs.width ? { 'data-width': attrs.width, style: `width:${attrs.width}px` } : {}),
      },
      caption: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-caption') || '',
        renderHTML: (attrs) => (attrs.caption ? { 'data-caption': attrs.caption } : {}),
      },
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageView)
  },
})

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    feImage: {
      setImageWidth: (width: number) => ReturnType
    }
  }
}
