import { X } from 'lucide-react'
import type { ReactNode } from 'react'

export function RecordSidePanel({ title, eyebrow, onClose, children }: { title: string; eyebrow: string; onClose: () => void; children: ReactNode }) {
  return (
    <aside className="record-side-panel" aria-label={`${title}资料工作栏`}>
      <header>
        <div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>
        <button aria-label="关闭资料工作栏" onClick={onClose}><X size={17} /></button>
      </header>
      <div className="record-side-panel-content">{children}</div>
    </aside>
  )
}
