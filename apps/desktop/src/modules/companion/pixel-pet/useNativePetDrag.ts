import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useCallback, useEffect, useRef } from 'react'

export interface NativePetDragHandlers { onDragStart: () => void; onDragEnd: () => void; onDragError: () => void }

// Windows starts native dragging asynchronously. Its promise is NOT a release signal.
export function useNativePetDrag(onStart?: () => void, onEnd?: () => void, onError?: () => void) {
  const callbacks = useRef({ onStart, onEnd, onError })
  callbacks.current = { onStart, onEnd, onError }
  const gesture = useRef<{ timer?: ReturnType<typeof setTimeout>; cancelled: boolean } | null>(null)
  const finish = useCallback((failed = false) => {
    const current = gesture.current
    if (!current) return
    current.cancelled = true; clearTimeout(current.timer); gesture.current = null
    if (failed) callbacks.current.onError?.()
    else callbacks.current.onEnd?.()
  }, [])
  useEffect(() => {
    const released = (event: PointerEvent) => { if (event.button === 0) finish() }
    window.addEventListener('pointerup', released)
    return () => {
      window.removeEventListener('pointerup', released)
      if (gesture.current) { gesture.current.cancelled = true; clearTimeout(gesture.current.timer); gesture.current = null }
    }
  }, [finish])
  return useCallback(() => {
    if (gesture.current) return
    const current = { cancelled: false, timer: undefined as ReturnType<typeof setTimeout> | undefined }
    gesture.current = current; callbacks.current.onStart?.()
    const started = performance.now()
    const poll = async () => {
      try {
        const down = await invoke<boolean>('companion_primary_button_down')
        if (current.cancelled) return
        if (!down) { finish(); return }
        if (performance.now() - started > 120000) { finish(true); return }
        current.timer = setTimeout(() => void poll(), 80)
      } catch {
        // Non-Windows or denied query: keep native pointerup as the release signal.
        if (!current.cancelled) current.timer = setTimeout(() => finish(true), 120000)
      }
    }
    void getCurrentWindow().startDragging().then(() => {
      if (!current.cancelled) current.timer = setTimeout(() => void poll(), 80)
    }).catch(() => { if (!current.cancelled) finish(true) })
  }, [finish])
}
