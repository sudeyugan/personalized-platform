import { useEffect, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'

export function useTaskDetailFocus(taskId: string | undefined) {
  const [requestedId, setRequestedId] = useState<string>()
  const detailRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return
    let disposed = false
    let unlisten: (() => void) | undefined
    void listen<{ taskId: string }>('companion:task-detail', ({ payload }) => {
      if (!disposed && typeof payload?.taskId === 'string') setRequestedId(payload.taskId)
    }).then((stop) => { if (disposed) stop(); else unlisten = stop }).catch(console.warn)
    return () => { disposed = true; unlisten?.() }
  }, [])
  const expanded = Boolean(taskId && requestedId === taskId)
  useEffect(() => {
    if (!expanded) return
    detailRef.current?.focus({ preventScroll: true })
    detailRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [expanded, requestedId])
  return { detailRef, expanded }
}
