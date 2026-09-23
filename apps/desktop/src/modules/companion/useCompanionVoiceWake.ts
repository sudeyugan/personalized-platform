import { emitTo } from '@tauri-apps/api/event'
import { CommitStrategy, RealtimeConnection, RealtimeEvents, Scribe } from '@elevenlabs/client'
import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { localVoice } from '../../infrastructure/localVoice'
import type { CompanionDesktopSnapshot } from './companionDesktop'

const FOLLOW_UP_WINDOW_MS = 15_000
const MAX_SESSION_MS = 120_000

interface CompanionVoiceWakeOptions {
  voice: CompanionDesktopSnapshot['voice']
  agentBusy: RefObject<boolean>
  speechBusy: RefObject<boolean>
  requestToken: () => Promise<string>
  setSpeechNote: Dispatch<SetStateAction<string>>
}

export function useCompanionVoiceWake({ voice, agentBusy, speechBusy, requestToken, setSpeechNote }: CompanionVoiceWakeOptions) {
  const cloudConnection = useRef<RealtimeConnection | undefined>(undefined)
  const localMonitor = useRef<{ stop: () => void } | undefined>(undefined)
  const commitTimer = useRef<number | undefined>(undefined)
  const followUpTimer = useRef<number | undefined>(undefined)
  const sessionTimer = useRef<number | undefined>(undefined)
  const armed = useRef(false)

  useEffect(() => {
    if (!voice.wakeEnabled || voice.sttProviderId !== 'elevenlabs') {
      localMonitor.current?.stop()
      localMonitor.current = undefined
      cloudConnection.current?.close()
      cloudConnection.current = undefined
      armed.current = false
      window.clearTimeout(commitTimer.current)
      window.clearTimeout(followUpTimer.current)
      window.clearTimeout(sessionTimer.current)
      return
    }
    let disposed = false
    let reconnectTimer: number | undefined
    let closingCloud = false

    const endConversation = (hide = false) => {
      window.clearTimeout(followUpTimer.current)
      window.clearTimeout(sessionTimer.current)
      armed.current = false
      closingCloud = true
      cloudConnection.current?.close()
      cloudConnection.current = undefined
      void emitTo('main', 'companion:voice-session-ended', {})
      if (hide) void emitTo('main', 'companion:voice-hide-request', {})
      setSpeechNote(hide ? '伙伴已经隐藏，再叫醒我就好。' : `对话已结束，说“${voice.wakeWord}”可以再次唤醒。`)
      void startLocalListening()
    }
    const scheduleFollowUp = () => {
      window.clearTimeout(followUpTimer.current)
      const waitUntilIdle = () => {
        if (disposed || !armed.current) return
        if (agentBusy.current || speechBusy.current) {
          followUpTimer.current = window.setTimeout(waitUntilIdle, 500)
          return
        }
        setSpeechNote('还在听，可以继续说。')
        followUpTimer.current = window.setTimeout(() => {
          if (agentBusy.current || speechBusy.current) waitUntilIdle()
          else endConversation()
        }, FOLLOW_UP_WINDOW_MS)
      }
      followUpTimer.current = window.setTimeout(waitUntilIdle, 500)
    }
    const enforceSessionLimit = () => {
      if (disposed || !armed.current) return
      if (agentBusy.current || speechBusy.current) {
        sessionTimer.current = window.setTimeout(enforceSessionLimit, 500)
        return
      }
      endConversation()
    }
    const handleUtterance = (value: string) => {
      if (!armed.current) return
      const text = value.trim()
      if (!text) return
      const normalized = text.replace(/[，。！？,.!?\s]/g, '')
      if (/^(?:小鱼)?(?:藏起来|隐藏起来|休息吧|退下吧)$/.test(normalized)) {
        void emitTo('main', 'companion:turn-stop', {})
        void emitTo('main', 'companion:speech-stop', {})
        endConversation(true)
        return
      }
      if (/^(?:小鱼)?(?:先这样|结束对话|不聊了)$/.test(normalized)) {
        void emitTo('main', 'companion:turn-stop', {})
        void emitTo('main', 'companion:speech-stop', {})
        endConversation()
        return
      }
      if (agentBusy.current || speechBusy.current) return
      scheduleFollowUp()
      setSpeechNote('语音聊天中，回答后可以继续说。')
      void emitTo('main', 'companion:chat-open-request', {})
      void emitTo('main', 'companion:chat-send', { message: text, inputMode: 'voice', wake: true })
    }
    const connectConversation = async () => {
      try {
        const token = await requestToken()
        if (disposed || !armed.current) return
        let partial = ''
        const connection = Scribe.connect({
          token,
          modelId: 'scribe_v2_realtime',
          languageCode: 'zh',
          secondaryLanguages: ['en'],
          commitStrategy: CommitStrategy.MANUAL,
          microphone: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            workletPaths: { scribeAudioProcessor: '/vendor/elevenlabs/scribe-audio-processor.js' },
          },
        })
        connection.on(RealtimeEvents.PARTIAL_TRANSCRIPT, (event) => {
          partial = event.text
          window.clearTimeout(commitTimer.current)
          commitTimer.current = window.setTimeout(() => { if (partial.trim()) connection.commit() }, 900)
        })
        connection.on(RealtimeEvents.COMMITTED_TRANSCRIPT, (event) => { partial = ''; handleUtterance(event.text) })
        connection.on(RealtimeEvents.ERROR, (event) => setSpeechNote(`语音聊天暂不可用：${event.error || '实时转写失败'}`))
        connection.on(RealtimeEvents.CLOSE, () => {
          if (cloudConnection.current === connection) cloudConnection.current = undefined
          if (disposed || closingCloud) {
            closingCloud = false
            return
          }
          if (armed.current) reconnectTimer = window.setTimeout(() => void connectConversation(), 1500)
        })
        cloudConnection.current = connection
        setSpeechNote(`${voice.wakeWord}在听，请说出问题。`)
      } catch (error) {
        if (disposed || !armed.current) return
        setSpeechNote(`语音聊天暂不可用：${error instanceof Error ? error.message.replace(/^[A-Z_]+:/, '') : '请检查语音服务'}`)
        reconnectTimer = window.setTimeout(() => void connectConversation(), 3000)
      }
    }
    const activateConversation = () => {
      if (disposed || armed.current) return
      localMonitor.current?.stop()
      localMonitor.current = undefined
      armed.current = true
      closingCloud = false
      void emitTo('main', 'companion:voice-show-request', {})
      void emitTo('main', 'companion:chat-open-request', {})
      setSpeechNote(`${voice.wakeWord}听到了，请继续说问题。`)
      scheduleFollowUp()
      window.clearTimeout(sessionTimer.current)
      sessionTimer.current = window.setTimeout(enforceSessionLimit, MAX_SESSION_MS)
      void connectConversation()
    }
    async function startLocalListening() {
      if (disposed || armed.current || localMonitor.current) return
      try {
        const monitor = await localVoice.monitor({
          wakeWord: voice.wakeWord,
          wakeSensitivity: voice.wakeSensitivity,
          speakerVerification: voice.speakerVerification,
        }, (result) => {
          if (!result.speakerMatched) {
            setSpeechNote(`听到了“${voice.wakeWord}”，但声纹没有通过。`)
            return
          }
          activateConversation()
        }, (error) => {
          setSpeechNote(`本地唤醒暂不可用：${error instanceof Error ? error.message.replace(/^[A-Z_]+:/, '') : String(error)}`)
        })
        if (disposed || armed.current) {
          monitor.stop()
          return
        }
        localMonitor.current = monitor
        setSpeechNote(`本地待机中，说“${voice.wakeWord}”唤醒。`)
      } catch (error) {
        if (!disposed) setSpeechNote(`本地唤醒暂不可用：${error instanceof Error ? error.message.replace(/^[A-Z_]+:/, '') : String(error)}`)
      }
    }
    void startLocalListening()
    return () => {
      disposed = true
      window.clearTimeout(reconnectTimer)
      window.clearTimeout(commitTimer.current)
      window.clearTimeout(followUpTimer.current)
      window.clearTimeout(sessionTimer.current)
      localMonitor.current?.stop()
      localMonitor.current = undefined
      closingCloud = true
      cloudConnection.current?.close()
      cloudConnection.current = undefined
      armed.current = false
    }
  }, [agentBusy, requestToken, setSpeechNote, speechBusy, voice.speakerVerification, voice.sttProviderId, voice.wakeEnabled, voice.wakeSensitivity, voice.wakeWord])
}
