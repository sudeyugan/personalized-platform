import { emitTo } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PixelPoint } from './types'
import type { createPixelWindowLayout, PixelLayout } from './windowLayout'

export function useCompanionPlacement(controller: Pick<ReturnType<typeof createPixelWindowLayout>, 'settle'>, onLayout: (layout: PixelLayout) => void, enabled: boolean) {
  const latest = useRef({ onLayout, enabled })
  latest.current = { onLayout, enabled }
  const draggingRef = useRef(false)
  const [dragging, setDragging] = useState(false)
  const motion = useRef<PixelPoint>({ x: 0, y: 0 })
  const lastPosition = useRef<PixelPoint | undefined>(undefined)
  const alive = useRef(false)
  const settle = useCallback(async (snap: boolean) => {
    try {
      const layout = await controller.settle(snap)
      if (!alive.current) return
      latest.current.onLayout(layout)
      if (snap && layout.ready && layout.side) await emitTo('main', 'companion:pet-side', { side: layout.side })
      await emitTo('main', 'companion:moved')
    } catch { /* Restoring will retry at the next native move/mode change. */ }
  }, [controller])
  useEffect(() => {
    alive.current = true
    let disposed = false, stop: (() => void) | undefined, timer: ReturnType<typeof setTimeout> | undefined
    void getCurrentWindow().onMoved((event) => {
      const point = event?.payload
      if (draggingRef.current && point) {
        const previous = lastPosition.current
        if (previous) motion.current = { x: Math.max(-1, Math.min(1, (point.x - previous.x) / 18)), y: Math.max(-1, Math.min(1, (point.y - previous.y) / 18)) }
        lastPosition.current = point
      }
      clearTimeout(timer)
      timer = setTimeout(() => { if (!disposed && latest.current.enabled && !draggingRef.current) void settle(false) }, 300)
    }).then(unlisten => { if (disposed) unlisten(); else stop = unlisten }).catch(() => undefined)
    return () => { disposed = true; alive.current = false; clearTimeout(timer); stop?.() }
  }, [settle])
  return {
    dragging, motion,
    onDragStart: useCallback(() => { draggingRef.current = true; lastPosition.current = undefined; motion.current = { x: 0, y: 0 }; setDragging(true) }, []),
    onDragEnd: useCallback(() => { draggingRef.current = false; void (latest.current.enabled ? settle(true) : Promise.resolve()).finally(() => { if (alive.current) setDragging(false) }) }, [settle]),
    onDragError: useCallback(() => { draggingRef.current = false; void (latest.current.enabled ? settle(false) : Promise.resolve()).finally(() => { if (alive.current) setDragging(false) }) }, [settle]),
  }
}
