import { emitTo, listen } from '@tauri-apps/api/event'
import { useCallback, useEffect, useState } from 'react'
import { resolveChatPresentation, type ChatPresentation } from './chatPresentation'

export function useChatPresentation(attention: boolean) {
  const [requested, setRequested] = useState<ChatPresentation>('bubble')
  const [compactMode, setCompactMode] = useState<'bubble' | 'voice'>('bubble')
  const mode = resolveChatPresentation(requested, attention)
  useEffect(() => {
    let disposed = false
    let stop: (() => void) | undefined
    void listen<{ mode: ChatPresentation }>('companion:chat-presentation', ({ payload }) => {
      if (!disposed && ['bubble', 'voice', 'full'].includes(payload.mode)) {
        setRequested(payload.mode)
        if (payload.mode !== 'full') setCompactMode(payload.mode)
      }
    }).then((value) => { if (disposed) value(); else stop = value })
    return () => { disposed = true; stop?.() }
  }, [])
  useEffect(() => { void emitTo('main', 'companion:chat-presentation-request', { mode }) }, [mode])
  const choose = useCallback((next: ChatPresentation) => {
    setRequested(next)
    if (next !== 'full') setCompactMode(next)
  }, [])
  return { mode, compactMode, choose }
}
