// 站内文档引用（M33）：分享按钮复制 remainder://doc/<id> 链接，
// 粘贴进编辑器自动解析为蓝色文档卡片（📄 + 标题），点击触发 fe-nav-doc 站内跳转
import { Node, mergeAttributes } from '@tiptap/core'

export const DOC_REF_PREFIX = 'remainder://doc/'
export const DOC_REF_RE = /^remainder:\/\/doc\/([\w-]+)\s*$/

export const DocRef = Node.create({
  name: 'docRef',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-id'),
        renderHTML: (a) => ({ 'data-id': a.id }),
      },
      title: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-title') || '',
        renderHTML: (a) => ({ 'data-title': a.title }),
      },
    }
  },
  parseHTML() {
    return [{ tag: 'span[data-type="doc-ref"]' }]
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'doc-ref',
        class: 'fe-doc-ref',
        title: '点击跳转到该文档',
      }),
      `📄 ${node.attrs.title || '未命名文档'}`,
    ]
  },
})
