/**
 * 斜杠菜单 / 块把手菜单与页面层（EditorPage）的解耦注册点。
 * 菜单条目在纯数据模块里无法直接触碰页面状态（AI 侧栏、Toast、复制文档），
 * 由 EditorPage 挂载时注入实现。
 */
import type { Editor } from '@tiptap/core'

export interface AIOpenOptions {
  /** 打开后自动发送的提示词（如浮条「解释」） */
  prompt?: string
  /** 以快捷指令（帮我写/续写/润色/翻译/总结）模式打开（斜杠菜单「AI帮我写」） */
  quick?: boolean
}

export interface SlashHelpers {
  /** 打开右侧「问问AI」侧栏；上下文自动取当前选区/所在段 */
  openAI: (editor: Editor, opts?: AIOpenOptions) => void
  /** 底部轻提示 */
  toast: (msg: string) => void
  /** 创建当前文档副本并打开（斜杠菜单「创建副本」） */
  duplicateDoc: () => void
  /** 打开模版选择面板 */
  openTemplates: (editor: Editor) => void
  /** 当前文档 id（评论等功能需要） */
  docId: () => string
}

export const slashHelpers: SlashHelpers = {
  openAI: () => {},
  toast: () => {},
  duplicateDoc: () => {},
  openTemplates: () => {},
  docId: () => '',
}
