import { AlertTriangle, Archive, Trash2, X } from 'lucide-react'
import { useEffect, useRef } from 'react'

interface DialogFact { label: string; value: string }
interface Props {
  title: string
  subject: string
  description: string
  confirmLabel: string
  facts?: DialogFact[]
  permanent?: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmDialog({ title, subject, description, confirmLabel, facts = [], permanent = false, onCancel, onConfirm }: Props) {
  const dialogRef = useRef<HTMLElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const cancelHandler = useRef(onCancel)
  cancelHandler.current = onCancel
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    cancelRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelHandler.current()
      if (event.key !== 'Tab') return
      const buttons = [...(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
      if (!buttons.length) return
      const first = buttons[0]; const last = buttons[buttons.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => { window.removeEventListener('keydown', handleKeyDown); previousFocus?.focus() }
  }, [])

  return <div className="confirm-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}>
    <section ref={dialogRef} className={permanent ? 'confirm-dialog permanent' : 'confirm-dialog'} role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-description">
      <header>
        <div className="confirm-dialog-icon">{permanent ? <AlertTriangle size={22} /> : <Archive size={22} />}</div>
        <button aria-label="关闭确认框" onClick={onCancel}><X size={17} /></button>
      </header>
      <div className="confirm-dialog-copy">
        <p className="eyebrow">{permanent ? '不可恢复的操作' : '移入回收站'}</p>
        <h2 id="confirm-dialog-title">{title}</h2>
        <strong>{subject}</strong>
        <p id="confirm-dialog-description">{description}</p>
      </div>
      {facts.length > 0 && <dl>{facts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>}
      <footer>
        <button ref={cancelRef} className="ghost-button" onClick={onCancel}>先保留</button>
        <button className="danger-button" onClick={onConfirm}>{permanent ? <Trash2 size={15} /> : <Archive size={15} />}{confirmLabel}</button>
      </footer>
    </section>
  </div>
}
