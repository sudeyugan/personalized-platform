import { useEffect, useState } from 'react'
import { compactText, conversationCaption, type ChatPresentation } from './chatPresentation'

export function useConversationCaption({ mode, speech, speaking, listening, busy, stream, messages, reading }: {
  mode: ChatPresentation; speech: string; speaking: boolean; listening: boolean; busy: boolean
  stream: string; messages: { role: string; content: string }[]; reading: boolean
}) {
  const [held, setHeld] = useState('')
  useEffect(() => {
    if (mode !== 'voice' || listening) { setHeld(''); return }
    if (speaking && speech) { setHeld(speech); return }
    if (speaking || reading) return
    const timer = window.setTimeout(() => setHeld(''), 6000)
    return () => window.clearTimeout(timer)
  }, [mode, speech, speaking, listening, reading])
  // Never substitute unplayed model text for actual voice subtitles.
  const source = mode === 'voice'
    ? listening ? '我在听，你慢慢说。' : speaking ? speech || '正在准备这一句…' : busy ? '让我想一想…' : held || '我在这里，想说话时叫我就好。'
    : busy && !stream ? '让我想一想…' : conversationCaption('', stream, messages)
  return compactText(source, mode === 'voice' ? 120 : 180)
}
