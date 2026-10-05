import { useEffect, useState } from 'react'
import { Channel, invoke } from '@tauri-apps/api/core'
import { TaskFeedbackBubble } from './TaskFeedbackBubble'
import { isTaskFeedback, type TaskFeedback } from './taskFeedback'

function request(request: { kind: 'details' | 'dismiss'; taskId: string } | { kind: 'hover'; active: boolean }) {
  if ('__TAURI_INTERNALS__' in window) void invoke('companion_feedback_request', { request }).catch(console.warn)
}
export function DesktopTaskFeedbackWindow() {
  const [feedback, setFeedback] = useState<TaskFeedback>()
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return
    let disposed = false
    let subscriptionId: number | undefined
    const channel = new Channel<unknown>()
    channel.onmessage = (value) => { if (!disposed) setFeedback(isTaskFeedback(value) ? value : undefined) }
    const unsubscribe = (id: number) => { void invoke('companion_feedback_unsubscribe', { subscriptionId: id }).catch(console.warn) }
    void invoke<number>('companion_feedback_subscribe', { onChange: channel }).then((id) => {
      if (disposed) unsubscribe(id); else subscriptionId = id
    }).catch(console.warn)
    return () => {
      disposed = true; channel.onmessage = () => undefined
      if (subscriptionId !== undefined) unsubscribe(subscriptionId)
    }
  }, [])
  return <main className="desktop-task-feedback" onMouseEnter={() => request({ kind: 'hover', active: true })} onMouseLeave={() => request({ kind: 'hover', active: false })}>
    {feedback && <TaskFeedbackBubble feedback={feedback} onDetails={() => request({ kind: 'details', taskId: feedback.taskId })} onDismiss={() => request({ kind: 'dismiss', taskId: feedback.taskId })} />}
  </main>
}
