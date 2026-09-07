import { useState } from 'react'

function Avatar({ name, bg }: { name: string; bg: string }) {
  return (
    <div className="fe-share-avatar" style={{ background: bg }}>
      {name.slice(0, 1)}
    </div>
  )
}

export function SharePopover({ docId, onClose }: { docId: string; onClose: () => void }) {
  const [perm, setPerm] = useState('org-read')
  const [copied, setCopied] = useState(false)
  const link = `https://feishu-clone.local/doc/${docId}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      /* clipboard 不可用时忽略 */
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fe-modal-mask" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fe-modal">
        <div className="fe-modal-title">分享</div>
        <button className="fe-modal-close" onClick={onClose}>
          ×
        </button>

        <div className="fe-share-label">链接权限</div>
        <select className="fe-share-select" value={perm} onChange={(e) => setPerm(e.target.value)}>
          <option value="org-read">组织内获得链接的人可阅读</option>
          <option value="org-edit">组织内获得链接的人可编辑</option>
          <option value="invited">仅邀请的人</option>
        </select>

        <div className="fe-share-link-row">
          <input className="fe-share-link" value={link} readOnly />
          <button className="fe-btn-primary fe-share-copy" onClick={copy}>
            {copied ? '已复制' : '复制链接'}
          </button>
        </div>

        <div className="fe-share-label">协作者</div>
        <div className="fe-share-collab">
          <Avatar name="我" bg="linear-gradient(135deg,#3370FF,#7F3BF5)" />
          <span className="fe-share-name">我</span>
          <span className="fe-share-role">所有者</span>
        </div>
        <div className="fe-share-collab">
          <Avatar name="张三" bg="linear-gradient(135deg,#FF8800,#F54A45)" />
          <span className="fe-share-name">张三</span>
          <select className="fe-share-role-select" defaultValue="edit">
            <option value="edit">可编辑</option>
            <option value="read">可阅读</option>
          </select>
        </div>
        <div className="fe-share-collab">
          <Avatar name="李四" bg="linear-gradient(135deg,#34A853,#3370FF)" />
          <span className="fe-share-name">李四</span>
          <select className="fe-share-role-select" defaultValue="read">
            <option value="edit">可编辑</option>
            <option value="read">可阅读</option>
          </select>
        </div>
      </div>
    </div>
  )
}
