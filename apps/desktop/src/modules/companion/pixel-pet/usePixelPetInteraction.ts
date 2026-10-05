import { emitTo } from '@tauri-apps/api/event'
import { useNativePetDrag, type NativePetDragHandlers } from './useNativePetDrag'
import { useRef, useState, type PointerEvent, type MouseEvent } from 'react'

import type { PixelPoint } from './types'

export function usePixelPetInteraction(onActivate?: (point?: PixelPoint) => boolean | void, drag?: NativePetDragHandlers) {
  const gesture = useRef<{ id: number; x: number; y: number; dragged: boolean } | null>(null)
  const [error, setError] = useState('')
  const beginDrag = useNativePetDrag(drag?.onDragStart, drag?.onDragEnd, () => { setError('拖动暂不可用'); drag?.onDragError() })
  const release = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const activate = (point?: PixelPoint) => {
    if (onActivate?.(point) !== true) void emitTo('main', 'companion:chat-toggle')
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
      beginDrag()
    },
    onPointerUp(event: PointerEvent<HTMLButtonElement>) {
      const start = gesture.current
      if (!start || start.id !== event.pointerId) return
      release(event)
      gesture.current = null
      if (!start.dragged) {
        const rect = event.currentTarget.getBoundingClientRect()
        activate(rect.width && rect.height ? { x: (event.clientX - rect.left) / rect.width * 192, y: (event.clientY - rect.top) / rect.height * 240 } : undefined)
      }
    },
    onPointerCancel(event: PointerEvent<HTMLButtonElement>) { release(event); gesture.current = null },
    // Native pointer clicks are handled on pointerup; detail=0 is keyboard/AT activation.
    onClick(event: MouseEvent<HTMLButtonElement>) { if (event.detail === 0) activate() },
    onDoubleClick() { void emitTo('main', 'companion:open-main') },
  }
}
