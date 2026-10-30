import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { FolioLinks } from './FolioLinks'

export function PageIndex({ current, go, close }: { current: string; go(page: string): void; close(): void }) {
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    const focused = document.activeElement as HTMLElement | null
    const app = document.querySelector<HTMLElement>('.mobile-app')
    const inert = app?.inert ?? false, overflow = document.body.style.overflow
    if (app) app.inert = true
    document.body.style.overflow = 'hidden'
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const back = (event: Event) => { event.preventDefault(); close() }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') back(event)
      if (event.key !== 'Tab') return
      const buttons = panel.current?.querySelectorAll<HTMLButtonElement>('button')
      if (!buttons?.length) return
      const first = buttons[0], last = buttons[buttons.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('yiyu-back', back)
    window.addEventListener('keydown', key)
    return () => {
      if (app) app.inert = inert
      document.body.style.overflow = overflow
      window.removeEventListener('yiyu-back', back)
      window.removeEventListener('keydown', key)
      if (focused?.isConnected) focused.focus()
    }
  }, [close])
  return createPortal(
    <div className="folio-index-backdrop" onClick={(event) => { if (event.target === event.currentTarget) close() }}>
      <section ref={panel} className="folio-index" role="dialog" aria-modal="true" aria-label="功能索引" id="folio-index">
        <header><div><span className="eyebrow">一隅 · 卷目</span><h2>想翻到哪一页？</h2></div><button className="icon-button" aria-label="收起功能索引" onClick={close}><X size={22}/></button></header>
        <nav aria-label="功能索引目录">
          <FolioLinks current={current} go={go}/>
        </nav>
        <footer>各有一页，同在一隅。</footer>
      </section>
    </div>, document.body,
  )
}
