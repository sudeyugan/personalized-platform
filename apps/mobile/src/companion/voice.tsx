import { useEffect, useSyncExternalStore } from 'react'
import {
  sendConversation,
  stopConversation,
  cancelConversation,
  subscribeConversation,
  conversationSnapshot,
} from './conversation'
import { currentVoice, updateVoice, useVoice, voiceActive, type VoiceState } from './voiceState'
export function VoiceCoordinator() {
  useEffect(() => {
    let closed = false,
      processing = false
    const receive = (event: Event) => {
      const value = (event as CustomEvent<VoiceState>).detail
      if (
        !value ||
        !['idle', 'listening', 'thinking', 'speaking', 'error'].includes(value.phase) ||
        typeof value.session !== 'string'
      )
        return
      updateVoice(value)
      if (!voiceActive(value.phase)) {
        if (processing) cancelConversation()
        return
      }
      if (!value.transcript || processing) return
      processing = true
      void sendConversation(value.transcript, true)
        .then((reply) => {
          if (
            !closed &&
            currentVoice().session === value.session &&
            currentVoice().phase === 'thinking'
          )
            window.YiyuMobile?.voiceReply?.(value.session, reply)
        })
        .catch(() => {
          if (!closed && currentVoice().session === value.session)
            window.YiyuMobile?.voiceReject?.(value.session)
        })
        .finally(() => {
          processing = false
        })
    }
    window.addEventListener('yiyu-voice', receive)
    window.YiyuMobile?.voiceReady?.()
    return () => {
      closed = true
      window.removeEventListener('yiyu-voice', receive)
      stopConversation()
    }
  }, [])
  return null
}
export function VoiceControl() {
  const conversation = useSyncExternalStore(subscribeConversation, conversationSnapshot)
  const voice = useVoice(),
    active = voiceActive(voice.phase)
  return (
    <div className="voice-controls">
      <button
        className={active ? 'voice-end' : 'primary'}
        disabled={!window.YiyuMobile?.startVoice || (!active && conversation.busy)}
        onClick={() => (active ? stopConversation() : window.YiyuMobile?.startVoice?.())}
      >
        {active ? '结束语音' : '和小鱼说话'}
      </button>
      <span role="status">
        {voice.note ||
          {
            idle: '轻点后开始，锁屏即停止',
            listening: '我在听',
            thinking: '墨色正缓缓成形',
            speaking: '小鱼正在说',
            error: '请查看手机语音设置',
          }[voice.phase]}
      </span>
    </div>
  )
}
