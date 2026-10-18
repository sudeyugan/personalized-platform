import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import type { IdeaData } from '../../domain/ideas/types'
import { IdeaNotebook } from './IdeaNotebook'

export function IdeaLibraryDrawer({ data, onClose, onNew, onSelect }: {
  data: IdeaData; onClose(): void; onNew(): void; onSelect(id: string): void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current!, previous = document.activeElement as HTMLElement | null
    if (element.showModal) element.showModal()
    else element.setAttribute('open', '')
    element.querySelector<HTMLButtonElement>('button')?.focus()
    return () => { if (element.close) element.close(); previous?.focus({ preventScroll: true }) }
  }, [])
  return <dialog ref={dialog} className="idea-library-drawer" aria-label="手稿册" aria-modal="true"
    onCancel={event => { event.preventDefault(); onClose() }}
    onClick={event => { if (event.target === event.currentTarget) onClose() }}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); onClose() }
      if (event.key !== 'Tab') return
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), [href], [tabindex="0"]')]
      const first = controls[0], last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }}>
    <div className="idea-drawer-inner">
      <header><div><span className="idea-eyebrow">纸上来路</span><h2>把念头，留在这里</h2></div><button className="idea-small-icon" type="button" aria-label="关闭手稿册" onClick={onClose}><X size={20} /></button></header>
      <IdeaNotebook data={data} onNew={onNew} onSelect={onSelect} />
      <p className="idea-drawer-colophon">每一份未完成，<br />都有再落一笔的余地。</p>
    </div>
  </dialog>
}
