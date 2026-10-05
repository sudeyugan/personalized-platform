import { invoke } from '@tauri-apps/api/core'
import { useEffect, useRef } from 'react'
import { emitTo, listen } from '@tauri-apps/api/event'
import { LogicalSize, PhysicalPosition } from '@tauri-apps/api/dpi'
import { availableMonitors, getAllWindows, type Window as TauriWindow } from '@tauri-apps/api/window'
import type { CompanionDesktopSnapshot } from '../companionDesktop'
import { positionCompanionChat } from '../companionChatLayout'
import { feedbackPlacement } from './feedbackPlacement'
import { createFeedbackSession, type TaskFeedback } from './taskFeedback'

async function placeFeedback(portrait: TauriWindow, bubble: TauriWindow, valid: () => boolean) {
  const [position, size, monitors] = await Promise.all([portrait.outerPosition(), portrait.outerSize(), availableMonitors()])
  if (!valid()) return
  const center = { x: position.x + size.width / 2, y: position.y + size.height / 2 }
  const monitor = [...monitors].sort((a, b) => {
    const distance = (item: typeof a) => Math.hypot(center.x - (item.workArea.position.x + item.workArea.size.width / 2), center.y - (item.workArea.position.y + item.workArea.size.height / 2))
    return distance(a) - distance(b)
  })[0]
  if (!monitor) return
  const area = monitor.workArea
  const next = feedbackPlacement({ x: position.x, y: position.y, width: size.width, height: size.height },
    { x: area.position.x, y: area.position.y, width: area.size.width, height: area.size.height },
    { width: 244 * monitor.scaleFactor, height: 64 * monitor.scaleFactor }, 8 * monitor.scaleFactor)
  await bubble.setPosition(new PhysicalPosition(next.x, next.y))
  if (valid()) await bubble.setSize(new LogicalSize(244, 64))
}

export function useTaskFeedbackBridge(snapshot: CompanionDesktopSnapshot, onDetailsOpened: () => void) {
  const latest = useRef(snapshot)
  latest.current = snapshot
  const opened = useRef(onDetailsOpened)
  opened.current = onDetailsOpened
  const refresh = useRef<() => void>(() => undefined)
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return
    let disposed = false
    let revision = 0
    let hovered = false
    let shown: TaskFeedback | undefined
    let lastKey = ''
    let movedTimer: number | undefined
    let chain: Promise<unknown> = Promise.resolve()
    let pair: { portrait?: TauriWindow; bubble?: TauriWindow; chat?: TauriWindow } = {}
    const stops: (() => void)[] = []
    const session = createFeedbackSession()
    const visible = () => latest.current.desktopVisible && latest.current.desktopMode !== 'quiet'
    const enqueue = (operation: () => Promise<void>) => {
      chain = chain.then(operation).catch((error) => { if (!disposed) console.warn('Task feedback window:', error) })
    }
    const update = (reposition = false) => {
      if (!visible()) hovered = false
      const next = session.update(latest.current.task, Date.now(), visible())
      const notice = next ?? (hovered && visible() && shown?.taskId === latest.current.task?.id ? shown : undefined)
      const key = JSON.stringify([notice, latest.current.desktopMode])
      if (!reposition && key === lastKey) return
      lastKey = key
      shown = notice
      const version = ++revision
      const valid = () => !disposed && version === revision
      enqueue(async () => {
        if (!valid() || !pair.bubble || !pair.portrait) return
        if (!notice) { await pair.bubble.hide(); await invoke('companion_feedback_publish', { feedback: null, topmost: latest.current.desktopMode !== 'normal' }); return }
        await invoke('companion_feedback_publish', { feedback: notice, topmost: latest.current.desktopMode !== 'normal' })
        if (!valid()) return
        await placeFeedback(pair.portrait, pair.bubble, valid)
        if (valid()) await pair.bubble.show()
      })
    }
    refresh.current = () => update()
    const subscribe = async <T,>(event: string, handler: (payload: T) => void) => {
      const stop = await listen<T>(event, ({ payload }) => { if (!disposed) handler(payload) })
      if (disposed) stop(); else stops.push(stop)
    }
    void (async () => {
      const windows = await getAllWindows()
      if (disposed) return
      pair = { portrait: windows.find((item) => item.label === 'companion'), bubble: windows.find((item) => item.label === 'companion-feedback'), chat: windows.find((item) => item.label === 'companion-chat') }
      await Promise.all([
        subscribe<{ active: boolean }>('companion:feedback-hover', (payload) => { hovered = payload?.active === true; update() }),
        subscribe<{ taskId: string }>('companion:feedback-dismiss', (payload) => {
          if (payload?.taskId !== shown?.taskId) return
          hovered = false; session.dismiss(payload.taskId); update()
        }),
        subscribe<{ taskId: string }>('companion:feedback-details', (payload) => {
          if (!visible() || !shown || payload?.taskId !== shown.taskId || latest.current.task?.id !== payload.taskId) return
          const taskId = payload.taskId
          hovered = false; session.dismiss(taskId); update()
          enqueue(async () => {
            if (disposed || !visible() || latest.current.task?.id !== taskId || !pair.portrait || !pair.chat) return
            await positionCompanionChat(pair.portrait, pair.chat)
            if (disposed || !visible() || latest.current.task?.id !== taskId) return
            await emitTo('companion-chat', 'companion:snapshot', latest.current)
            await emitTo('companion-chat', 'companion:task-detail', { taskId })
            if (disposed || !visible()) return
            opened.current()
            await pair.chat.show()
            await pair.chat.setFocus().catch(() => undefined)
          })
        }),
      ])
      if (pair.portrait) {
        const stop = await pair.portrait.onMoved(() => {
          if (!shown || disposed) return
          window.clearTimeout(movedTimer)
          movedTimer = window.setTimeout(() => update(true), 120)
        })
        if (disposed) stop(); else stops.push(stop)
      }
      update(true)
    })().catch((error) => { if (!disposed) console.warn('Task feedback setup:', error) })
    const timer = window.setInterval(() => update(), 500)
    return () => {
      disposed = true; revision++; refresh.current = () => undefined
      window.clearInterval(timer); window.clearTimeout(movedTimer)
      stops.forEach((stop) => stop())
      // Queue cleanup after an already-running show, so it cannot reappear late.
      enqueue(async () => { await pair.bubble?.hide(); await invoke('companion_feedback_publish', { feedback: null, topmost: latest.current.desktopMode !== 'normal' }) })
    }
  }, [])
  useEffect(() => { refresh.current() }, [snapshot])
}
