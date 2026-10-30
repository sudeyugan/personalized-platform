import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { holdEdits, sync } from '../repository'
export function Sheet({
  title,
  children,
  dirty,
  close,
  save,
}: {
  title: string
  children: ReactNode
  dirty: boolean
  close(): void
  save(): Promise<void>
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const latest = useRef({ dirty, busy, close })
  const panel = useRef<HTMLElement>(null)
  latest.current = { dirty, busy, close }
  const leave = () => {
    const current = latest.current
    if (!current.busy && (!current.dirty || confirm('这几笔尚未保存，要放弃吗？'))) current.close()
  }
  useEffect(() => {
    const release = holdEdits()
    const before = (event: BeforeUnloadEvent) => {
      if (latest.current.dirty) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    const back = (event: Event) => {
      event.preventDefault()
      leave()
    }
    window.addEventListener('beforeunload', before)
    window.addEventListener('yiyu-back', back)
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') back(event)
      if (event.key !== 'Tab') return
      const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? []).filter(element => element.getClientRects().length > 0 && !element.closest('[inert]'))
      if (!controls.length) { event.preventDefault(); panel.current?.focus(); return }
      const first = controls[0], last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', key)
    const app = document.querySelector<HTMLElement>('.mobile-app'),
      wasInert = app?.inert ?? false
    const focused = document.activeElement as HTMLElement | null
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus()
    if (app) app.inert = true
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      release()
      void sync()
      document.body.style.overflow = original
      window.removeEventListener('beforeunload', before)
      window.removeEventListener('yiyu-back', back)
      window.removeEventListener('keydown', key)
      if (app) app.inert = wasInert
      if (focused?.isConnected) focused.focus()
    }
  }, [])
  return createPortal(
    <section ref={panel} tabIndex={-1} className="editor-sheet" role="dialog" aria-modal="true" aria-label={title}>
      <header>
        <button onClick={leave} disabled={busy}>
          返回
        </button>
        <span>{title}</span>
        <button
          className="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError('')
            try {
              await save()
              close()
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : '没有保存成功，请重试。')
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? '正在留存' : '保存'}
        </button>
      </header>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      <div className="sheet-body" inert={busy || undefined}>
        {children}
      </div>
    </section>,
    document.body,
  )
}
