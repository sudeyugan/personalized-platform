import { useCallback, useEffect, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import type { AgentTask } from '../../../domain/models'

export function useTaskDetailFocus(taskId: string | undefined, status?: AgentTask['status']) {
  const [request, setRequest] = useState<{ id: string; status?: AgentTask['status'] }>()
  const current = useRef({ taskId, status })
  current.current = { taskId, status }
  const dismiss = useCallback(() => setRequest(undefined), [])
  const detailRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return
    let disposed = false
    const stops: (() => void)[] = []
    const keep = (stop: () => void) => { if (disposed) stop(); else stops.push(stop) }
    void listen<{ taskId: string }>('companion:task-detail', ({ payload }) => {
      if (!disposed && typeof payload?.taskId === 'string') setRequest({ id: payload.taskId, status: current.current.taskId === payload.taskId ? current.current.status : undefined })
    }).then(keep).catch(console.warn)
    // Ordinary reopen must not replay a previously requested completed task.
    void listen('companion:chat-presentation', () => { if (!disposed) dismiss() }).then(keep).catch(console.warn)
    return () => { disposed = true; stops.forEach(stop => stop()) }
  }, [dismiss])
  const expanded = Boolean(taskId && request?.id === taskId && (!request.status || request.status === status))
  // Native detail/snapshot events can arrive in the same render batch. Latch
  // the first matching phase so a later completion still retires the panel.
  useEffect(() => {
    if (status) setRequest(value => value && value.id === taskId && !value.status ? { ...value, status } : value)
  }, [taskId, status])
  useEffect(() => {
    if (!expanded) return
    detailRef.current?.focus({ preventScroll: true })
    detailRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [expanded, request])
  return { detailRef, expanded, dismiss }
}
