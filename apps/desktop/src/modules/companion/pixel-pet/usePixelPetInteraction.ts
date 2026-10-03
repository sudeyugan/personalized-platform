import { emitTo } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useRef, useState, type PointerEvent, type MouseEvent } from 'react'

export function usePixelPetInteraction() {
  const gesture = useRef<{ id: number; x: number; y: number; dragged: boolean } | null>(null)
  const [error, setError] = useState('')
  const release = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  return {
    error,
    onPointerDown(event: PointerEvent<HTMLButtonElement>) {
      if (event.button !== 0) return
      setError('')
      gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    onPointerMove(event: PointerEvent<HTMLButtonElement>) {
      const start = gesture.current
      if (!start || start.id !== event.pointerId || start.dragged || Math.hypot(event.clientX - start.x, event.clientY - start.y) < 5) return
      start.dragged = true
      release(event)
      void getCurrentWindow().startDragging().catch(() => setError('拖动暂不可用'))
    },
    onPointerUp(event: PointerEvent<HTMLButtonElement>) {
      const start = gesture.current
      if (!start || start.id !== event.pointerId) return
      release(event)
      gesture.current = null
      if (!start.dragged) void emitTo('main', 'companion:chat-toggle')
    },
    onPointerCancel(event: PointerEvent<HTMLButtonElement>) { release(event); gesture.current = null },
    // Native pointer clicks are handled on pointerup; detail=0 is keyboard/AT activation.
    onClick(event: MouseEvent<HTMLButtonElement>) { if (event.detail === 0) void emitTo('main', 'companion:chat-toggle') },
    onDoubleClick() { void emitTo('main', 'companion:open-main') },
  }
}
