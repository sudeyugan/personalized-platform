import { useEffect, type RefObject } from 'react'
import { listen } from '@tauri-apps/api/event'
import { getAllWindows } from '@tauri-apps/api/window'
import { positionCompanionChat } from './companionChatLayout'
import type { ChatPresentation } from './chatPresentation'

export function useChatPresentationBridge(visible: RefObject<boolean>, presentation: RefObject<ChatPresentation>) {
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return
    let disposed = false
    let stop: (() => void) | undefined
    void listen<{ mode: ChatPresentation }>('companion:chat-presentation-request', ({ payload }) => {
      if (disposed || !['bubble', 'voice', 'full'].includes(payload.mode)) return
      presentation.current = payload.mode
      if (visible.current) void getAllWindows().then((windows) => {
        const portrait = windows.find((item) => item.label === 'companion')
        const chat = windows.find((item) => item.label === 'companion-chat')
        if (!disposed && portrait && chat) return positionCompanionChat(portrait, chat, payload.mode)
      })
    }).then((value) => { if (disposed) value(); else stop = value })
    return () => { disposed = true; stop?.() }
  }, [presentation, visible])
}
