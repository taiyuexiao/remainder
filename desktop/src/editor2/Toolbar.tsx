import { useEffect, useReducer } from 'react'
import type { Editor } from '@tiptap/core'
import { Dropdown } from './Dropdown'
import { ToolbarBtn, ColorPanel } from './ToolbarBtns'
import { getVisibleHeadingLevels } from './headingLevels'
import { keyHint } from './shortcuts'
import { pickAndInsertImage } from './slashItems'
import { loadAIConfig, hasAIConfig } from './ai/config'
import { slashHelpers } from './slashHelpers'
import { FONT_FAMILIES, FONT_SIZES } from './textStyle'
import { TypoCheck } from './TypoCheck'
import { defaultCodeLang } from './CodeBlockView'
import * as I from './icons'

const CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九']

const CELL_BG = ['transparent', '#FFF1B8', '#D3F261', '#D6E4FF', '#EADCFF', '#FFD6E7', '#FFE7BA', '#F0F1F2']

/** 当前块类型标签（样式下拉按钮显示当前样式名） */
export function currentBlockLabel(editor: Editor): string {
  for (let l = 1; l <= 9; l++) {
    if (editor.isActive('heading', { level: l })) return `${CN[l - 1]}级标题`
  }
  if (editor.isActive('codeBlock')) return '代码块'
  if (editor.isActive('blockquote')) return '引用'
  return '正文'
}

/** 顶部工具栏（对齐飞书：无字号概念；样式下拉渐进；评论位；合并颜色面板；表格单元格增强） */
export function Toolbar({ editor, onAutoFormat }: { editor: Editor; onAutoFormat?: () => void }) {
  const [, force] = useReducer((x: number) => x + 1, 0)
  useEffect(() => {
    editor.on('transaction', force)
    return () => { editor.off('transaction', force) }
  }, [editor])

  const c = () => editor.chain().focus()
  const levels = getVisibleHeadingLevels(editor.state.doc)
  const inTable = editor.isActive('table')

  /** 一键排版入口：未配置模型时先引导到 AI 侧栏配置 */
  const openAutoFormat = () => {
    if (!hasAIConfig(loadAIConfig())) {
      slashHelpers.toast('请先在右侧 AI 栏配置模型')
      slashHelpers.openAI(editor)
      return
    }
    onAutoFormat?.()
  }

  return (
    <div className="fe-toolbar">
      <ToolbarBtn icon={<I.IconUndo size={17} />} tip={`撤销 ${keyHint('⌘Z', 'Ctrl+Z')}`} onClick={() => c().undo().run()} dim={!editor.can().undo()} />
      <ToolbarBtn icon={<I.IconRedo size={17} />} tip={`重做 ${keyHint('⌘⇧Z', 'Ctrl+Y')}`} onClick={() => c().redo().run()} dim={!editor.can().redo()} />

      <span className="fe-vsep" />

      {/* 样式下拉：当前块类型 + 渐进标题 */}
      <Dropdown button={({ open }) => (
        <button className={`fe-tbtn fe-blocktype${open ? ' on' : ''}`} title="样式" onMouseDown={(e) => e.preventDefault()}>
          <span>{currentBlockLabel(editor)}</span>
          <I.IconChevronDown size={12} />
        </button>
      )}>
        {(close) => (
          <div className="fe-menu" style={{ width: 150 }}>
            <div className={`fe-mi ${!editor.isActive('heading') ? 'on' : ''}`} onClick={() => { c().setParagraph().run(); close() }}>
              <I.IconTextT size={15} /><span>正文</span>
            </div>
            {levels.map((n) => (
              <div className={`fe-mi ${editor.isActive('heading', { level: n }) ? 'on' : ''}`} key={n}
                onClick={() => { c().setNode('heading', { level: n }).run(); close() }}>
                <I.IconHeading level={n} /><span>{CN[n - 1]}级标题</span>
              </div>
            ))}
          </div>
        )}
      </Dropdown>

      {/* 字体（remainder 回植，飞书无此功能） */}
      <Dropdown button={({ open }) => (
        <button className={`fe-tbtn fe-blocktype${open ? ' on' : ''}`} title="字体" onMouseDown={(e) => e.preventDefault()}>
          <span style={{ maxWidth: 56, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {FONT_FAMILIES.find(([, v]) => v === (editor.getAttributes('textStyle').fontFamily ?? ''))?.[0] ?? '默认字体'}
          </span>
          <I.IconChevronDown size={12} />
        </button>
      )}>
        {(close) => (
          <div className="fe-menu" style={{ width: 130 }}>
            {FONT_FAMILIES.map(([label, v]) => (
              <div
                className={`fe-mi ${(editor.getAttributes('textStyle').fontFamily ?? '') === v ? 'on' : ''}`}
                key={label}
                onClick={() => {
                  if (v) c().setFontFamily(v).run()
                  else c().unsetFontFamily().run()
                  close()
                }}
              >
                <span>{label}</span>
              </div>
            ))}
          </div>
        )}
      </Dropdown>

      {/* 字号（remainder 回植） */}
      <Dropdown button={({ open }) => (
        <button className={`fe-tbtn fe-blocktype${open ? ' on' : ''}`} title="字号" onMouseDown={(e) => e.preventDefault()}>
          <span>{editor.getAttributes('textStyle').fontSize ?? '默认'}</span>
          <I.IconChevronDown size={12} />
        </button>
      )}>
        {(close) => (
          <div className="fe-menu" style={{ width: 100 }}>
            {FONT_SIZES.map(([label, v]) => (
              <div
                className={`fe-mi ${(editor.getAttributes('textStyle').fontSize ?? '') === v ? 'on' : ''}`}
                key={label}
                onClick={() => {
                  if (v) c().setMark('textStyle', { fontSize: v }).run()
                  else c().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run()
                  close()
                }}
              >
                <span>{label}</span>
              </div>
            ))}
          </div>
        )}
      </Dropdown>

      <span className="fe-vsep" />

      <ToolbarBtn icon={<I.IconBold size={15} />} tip={`加粗 ${keyHint('⌘B', 'Ctrl+B')}`} on={editor.isActive('bold')} onClick={() => c().toggleBold().run()} />
      <ToolbarBtn icon={<I.IconItalic size={15} />} tip={`斜体 ${keyHint('⌘I', 'Ctrl+I')}`} on={editor.isActive('italic')} onClick={() => c().toggleItalic().run()} />
      <ToolbarBtn icon={<I.IconUnderline size={15} />} tip={`下划线 ${keyHint('⌘U', 'Ctrl+U')}`} on={editor.isActive('underline')} onClick={() => c().toggleUnderline().run()} />
      <ToolbarBtn icon={<I.IconStrike size={15} />} tip={`删除线 ${keyHint('⌘⇧X', 'Ctrl+Shift+X')}`} on={editor.isActive('strike')} onClick={() => c().toggleStrike().run()} />
      <ToolbarBtn icon={<I.IconCode size={15} />} tip={`行内代码 ${keyHint('Ctrl+⌘C', 'Ctrl+Shift+C')}`} on={editor.isActive('code')} onClick={() => c().toggleCode().run()} />

      {/* 颜色（字体颜色 + 背景色 合并面板） */}
      <Dropdown button={({ open }) => (
        <ToolbarBtn icon={<><I.IconFontColor size={15} /><I.IconChevronDown size={10} /></>} tip={`颜色 ${keyHint('⌘⌥H', 'Ctrl+Alt+H')}`} on={open} />
      )}>
        {(close) => <ColorPanel editor={editor} onChange={() => { force(); close() }} />}
      </Dropdown>

      <ToolbarBtn
        icon={<I.IconLink size={15} />}
        tip={`链接 ${keyHint('⌘K', 'Ctrl+K')}`}
        on={editor.isActive('link')}
        onClick={() => {
          if (editor.state.selection.empty) {
            editor.chain().focus().insertContent([{ type: 'text', text: '链接文本', marks: [{ type: 'link', attrs: { href: 'https://' } }] }]).run()
          } else {
            c().setLink({ href: 'https://' }).run()
          }
        }}
      />

      {/* 评论（占位） */}
      <ToolbarBtn
        icon={<I.IconComment size={15} />}
        tip={`评论 ${keyHint('⌘⌥M', 'Ctrl+Alt+M')}`}
        onClick={() => window.dispatchEvent(new CustomEvent('fe-toast', { detail: '选中文字后用浮动工具栏「评论」添加评论' }))}
      />

      {/* 对齐 */}
      <Dropdown button={({ open }) => (
        <ToolbarBtn icon={<><I.IconAlignLeft size={15} /><I.IconChevronDown size={10} /></>} tip="对齐" on={open} />
      )}>
        {(close) => (
          <div className="fe-menu" style={{ width: 120 }}>
            {([['left', <I.IconAlignLeft size={15} key="l" />, `居左 ${keyHint('⌘⇧L', 'Ctrl+Shift+L')}`], ['center', <I.IconAlignCenter size={15} key="c" />, `居中 ${keyHint('⌘⇧E', 'Ctrl+Shift+E')}`], ['right', <I.IconAlignRight size={15} key="r" />, `居右 ${keyHint('⌘⇧R', 'Ctrl+Shift+R')}`]] as const).map(([v, icon, label]) => (
              <div className="fe-mi" key={v} onClick={() => { c().setTextAlign(v).run(); close() }}>{icon}<span>{label}</span></div>
            ))}
          </div>
        )}
      </Dropdown>

      <span className="fe-vsep" />

      <ToolbarBtn icon={<I.IconBulletList size={15} />} tip={`无序列表 ${keyHint('⌘⇧8', 'Ctrl+Shift+8')}`} on={editor.isActive('bulletList')} onClick={() => c().toggleBulletList().run()} />
      <ToolbarBtn icon={<I.IconOrderedList size={15} />} tip={`有序列表 ${keyHint('⌘⇧7', 'Ctrl+Shift+7')}`} on={editor.isActive('orderedList')} onClick={() => c().toggleOrderedList().run()} />
      <ToolbarBtn icon={<I.IconTodoList size={15} />} tip={`任务 ${keyHint('⌘⌥T', 'Ctrl+Alt+T')}`} on={editor.isActive('taskList')} onClick={() => c().toggleTaskList().run()} />
      <ToolbarBtn icon={<I.IconQuote size={15} />} tip={`引用 ${keyHint('⌘⇧>', 'Ctrl+Shift+>')}`} on={editor.isActive('blockquote')} onClick={() => c().toggleBlockquote().run()} />

      <span className="fe-vsep" />

      <ToolbarBtn icon={<I.IconCodeBlock size={15} />} tip={`代码块 ${keyHint('⌘⌥C', 'Ctrl+Alt+C')}`} on={editor.isActive('codeBlock')} onClick={() => c().toggleCodeBlock({ language: defaultCodeLang() }).run()} />
      <ToolbarBtn icon={<I.IconDivider size={15} />} tip={`分割线 ${keyHint('⌘⌥S', 'Ctrl+Alt+S')}`} onClick={() => c().setHorizontalRule().run()} />
      <ToolbarBtn icon={<I.IconCallout size={15} />} tip="高亮块" on={editor.isActive('callout')} onClick={() => c().insertContent({ type: 'callout', attrs: { emoji: '💡', color: 'blue' }, content: [{ type: 'paragraph' }] }).run()} />
      <ToolbarBtn icon={<I.IconImage size={15} />} tip="插入图片" onClick={() => pickAndInsertImage(editor)} />

      {/* 表格 */}
      <Dropdown button={({ open }) => (
        <ToolbarBtn icon={<><I.IconTable size={15} /><I.IconChevronDown size={10} /></>} tip="表格" on={inTable || open} />
      )}>
        {(close) => (
          <div className="fe-menu" style={{ width: 168 }}>
            {inTable ? (
              <>
                <div className="fe-mi" onClick={() => { c().addRowAfter().run(); close() }}><I.IconPlus size={14} /><span>插入行</span></div>
                <div className="fe-mi" onClick={() => { c().addColumnAfter().run(); close() }}><I.IconPlus size={14} /><span>插入列</span></div>
                <div className="fe-mi" onClick={() => { c().deleteRow().run(); close() }}><I.IconMinus size={14} /><span>删除当前行</span></div>
                <div className="fe-mi" onClick={() => { c().deleteColumn().run(); close() }}><I.IconMinus size={14} /><span>删除当前列</span></div>
                <div className="fe-mi" onClick={() => { c().toggleHeaderRow().run(); close() }}><I.IconTable size={14} /><span>切换表头行</span></div>
                <div className="fe-menu-sep" />
                <div className="fe-menu-sub-label">单元格背景</div>
                <div className="fe-cell-colors">
                  {CELL_BG.map((col) => (
                    <button key={col} className="fe-color-dot" style={{ background: col === 'transparent' ? 'var(--bg-2)' : col }}
                      onClick={() => { c().setCellAttribute('backgroundColor', col === 'transparent' ? '' : col).run(); close() }} />
                  ))}
                </div>
                <div className="fe-menu-sub-label">单元格对齐</div>
                <div className="fe-cell-aligns">
                  <button title="左对齐" onClick={() => { c().setCellAttribute('textAlign', 'left').run(); close() }}><I.IconAlignLeft size={13} /></button>
                  <button title="居中" onClick={() => { c().setCellAttribute('textAlign', 'center').run(); close() }}><I.IconAlignCenter size={13} /></button>
                  <button title="右对齐" onClick={() => { c().setCellAttribute('textAlign', 'right').run(); close() }}><I.IconAlignRight size={13} /></button>
                </div>
                <div className="fe-menu-sep" />
                <div className="fe-mi danger" onClick={() => { c().deleteTable().run(); close() }}><I.IconTrash size={14} /><span>删除表格</span></div>
              </>
            ) : (
              <div className="fe-mi" onClick={() => { c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); close() }}>
                <I.IconTable size={14} /><span>插入 3×3 表格</span>
              </div>
            )}
          </div>
        )}
      </Dropdown>

      <span className="fe-flex1" />

      {/* 错别字批处理（remainder M18 回植） */}
      <TypoCheck editor={editor} />

      {/* 一键排版（AI 增强能力，超出飞书原生） */}
      <button type="button" className="fe-tbtn fe-autofmt-entry" title="一键排版：AI 分析全文并设置标题层级，预览确认后应用" onClick={openAutoFormat}>
        <I.IconMagic size={15} />
        <span>一键排版</span>
      </button>
    </div>
  )
}
