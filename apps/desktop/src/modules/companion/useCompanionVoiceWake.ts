import { emitTo } from '@tauri-apps/api/event'
import { CommitStrategy, RealtimeConnection, RealtimeEvents, Scribe } from '@elevenlabs/client'
import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { localVoice } from '../../infrastructure/localVoice'
import type { CompanionDesktopSnapshot } from './companionDesktop'
import { hasBargeInSignal, isDuplicateUtterance, isLikelyPlaybackEcho, resolveVoiceCommand, type VoiceConversationPhase } from './voiceConversation'

const FOLLOW_UP_WINDOW_MS = 15_000
const MAX_SESSION_MS = 120_000

interface CompanionVoiceWakeOptions {
  voice: CompanionDesktopSnapshot['voice']
  agentBusy: RefObject<boolean>
  speechBusy: RefObject<boolean>
  spokenText: RefObject<string>
  requestToken: () => Promise<string>
  setSpeechNote: Dispatch<SetStateAction<string>>
}

export function useCompanionVoiceWake({ voice, agentBusy, speechBusy, spokenText, requestToken, setSpeechNote }: CompanionVoiceWakeOptions) {
  const cloudConnection = useRef<RealtimeConnection | undefined>(undefined)
  const localMonitor = useRef<{ stop: () => void } | undefined>(undefined)
  const followUpTimer = useRef<number | undefined>(undefined)
  const sessionTimer = useRef<number | undefined>(undefined)
  const armed = useRef(false)
  const phase = useRef<VoiceConversationPhase>('sleeping')
  const interruptionPending = useRef(false)
  const lastUtterance = useRef<{ text: string; at: number } | undefined>(undefined)

  useEffect(() => {
    if (!voice.wakeEnabled || voice.sttProviderId !== 'elevenlabs') {
      localMonitor.current?.stop()
      localMonitor.current = undefined
      cloudConnection.current?.close()
      cloudConnection.current = undefined
      armed.current = false
      phase.current = 'sleeping'
      interruptionPending.current = false
      window.clearTimeout(followUpTimer.current)
      window.clearTimeout(sessionTimer.current)
      return
    }
    let disposed = false
    let reconnectTimer: number | undefined
    let closingCloud = false

    const setVoiceActivity = (active: boolean) => {
      void emitTo('main', 'companion:voice-activity', { active })
    }
    const resumeInterruptedSpeech = () => {
      if (!interruptionPending.current) return
      interruptionPending.current = false
      if (speechBusy.current) void emitTo('main', 'companion:speech-pause', { paused: false })
    }

    const endConversation = (hide = false) => {
      window.clearTimeout(followUpTimer.current)
      window.clearTimeout(sessionTimer.current)
      armed.current = false
      phase.current = 'sleeping'
      setVoiceActivity(false)
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
      if (isDuplicateUtterance(lastUtterance.current, text)) return
      lastUtterance.current = { text, at: Date.now() }
      const command = resolveVoiceCommand(text)
      if (command === 'hide') {
        void emitTo('main', 'companion:turn-stop', {})
        void emitTo('main', 'companion:speech-stop', {})
        endConversation(true)
        return
      }
      if (command === 'end') {
        void emitTo('main', 'companion:turn-stop', {})
        void emitTo('main', 'companion:speech-stop', {})
        endConversation()
        return
      }
      if ((speechBusy.current || interruptionPending.current) && isLikelyPlaybackEcho(text, spokenText.current)) {
        setVoiceActivity(false)
        resumeInterruptedSpeech()
        phase.current = 'speaking'
        setSpeechNote('还在听，你可以随时打断。')
        return
      }
      const replacing = agentBusy.current || speechBusy.current || interruptionPending.current
      if (replacing) {
        phase.current = 'interrupted'
        void emitTo('main', 'companion:turn-stop', {})
        void emitTo('main', 'companion:speech-stop', {})
      }
      interruptionPending.current = false
      setVoiceActivity(false)
      phase.current = 'committing'
      scheduleFollowUp()
      setSpeechNote(replacing ? '已打断上一条回答，正在处理新问题。' : '听到了，正在处理。')
      void emitTo('main', 'companion:chat-open-request', {})
      void emitTo('main', 'companion:chat-send', { message: text, inputMode: 'voice', wake: true, replace: true })
    }
    const connectConversation = async () => {
      try {
        const token = await requestToken()
        if (disposed || !armed.current) return
        const connection = Scribe.connect({
          token,
          modelId: 'scribe_v2_realtime',
          languageCode: 'zh',
          secondaryLanguages: ['en'],
          commitStrategy: CommitStrategy.VAD,
          vadSilenceThresholdSecs: 0.8,
          vadThreshold: 0.45,
          minSpeechDurationMs: 250,
          minSilenceDurationMs: 650,
          filterBackgroundAudio: true,
          noVerbatim: true,
          microphone: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            workletPaths: { scribeAudioProcessor: '/vendor/elevenlabs/scribe-audio-processor.js' },
          },
        })
        connection.on(RealtimeEvents.PARTIAL_TRANSCRIPT, (event) => {
          if (!event.text.trim()) return
          phase.current = 'listening'
          setVoiceActivity(true)
          if (speechBusy.current && hasBargeInSignal(event.text) && !isLikelyPlaybackEcho(event.text, spokenText.current) && !interruptionPending.current) {
            interruptionPending.current = true
            phase.current = 'interrupted'
            setSpeechNote('听到你在说话，已暂停朗读。')
            void emitTo('main', 'companion:speech-pause', { paused: true })
          }
        })
        connection.on(RealtimeEvents.COMMITTED_TRANSCRIPT, (event) => handleUtterance(event.text))
        connection.on(RealtimeEvents.ERROR, (event) => {
          setVoiceActivity(false)
          resumeInterruptedSpeech()
          setSpeechNote(`语音聊天暂不可用：${event.error || '实时转写失败'}`)
        })
        connection.on(RealtimeEvents.CLOSE, () => {
          setVoiceActivity(false)
          resumeInterruptedSpeech()
          if (cloudConnection.current === connection) cloudConnection.current = undefined
          if (disposed || closingCloud) {
            closingCloud = false
            return
          }
          if (armed.current) reconnectTimer = window.setTimeout(() => void connectConversation(), 1500)
        })
        cloudConnection.current = connection
        phase.current = 'listening'
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
      phase.current = 'listening'
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
      window.clearTimeout(followUpTimer.current)
      window.clearTimeout(sessionTimer.current)
      localMonitor.current?.stop()
      localMonitor.current = undefined
      closingCloud = true
      cloudConnection.current?.close()
      cloudConnection.current = undefined
      armed.current = false
      phase.current = 'sleeping'
      interruptionPending.current = false
      setVoiceActivity(false)
    }
  }, [agentBusy, requestToken, setSpeechNote, speechBusy, spokenText, voice.speakerVerification, voice.sttProviderId, voice.wakeEnabled, voice.wakeSensitivity, voice.wakeWord])
}
