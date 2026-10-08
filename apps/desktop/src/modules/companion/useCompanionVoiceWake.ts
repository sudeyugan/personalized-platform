import { emitTo } from '@tauri-apps/api/event'
import type { RealtimeConnection } from '@elevenlabs/client'
import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { localVoice } from '../../infrastructure/localVoice'
import type { LocalVoiceLease } from '../../infrastructure/localVoiceMonitor'
import { createPostWakeAudio } from './postWakeAudio'
import { openVoiceRecognition } from './voiceRecognition'
import type { createPlaybackEchoHistory } from './playbackEcho'
import type { CompanionDesktopSnapshot } from './companionDesktop'
import { followUpWindowMs, hasBargeInSignal, isDuplicateUtterance, isLikelyPlaybackEcho, isMeaningfulVoiceUtterance, resolveVoiceCommand, type VoiceConversationPhase } from './voiceConversation'

const INITIAL_LISTENING_WINDOW_MS = 15_000
const BARGE_IN_CONFIRM_MS = 500
const MAX_SESSION_MS = 120_000

interface CompanionVoiceWakeOptions {
  voice: CompanionDesktopSnapshot['voice']
  agentBusy: RefObject<boolean>
  speechBusy: RefObject<boolean>
  spokenText: RefObject<string>
  recentSpeech?: RefObject<ReturnType<typeof createPlaybackEchoHistory>>
  requestToken: () => Promise<string>
  setSpeechNote: Dispatch<SetStateAction<string>>
}

export function useCompanionVoiceWake({ voice, agentBusy, speechBusy, spokenText, recentSpeech, requestToken, setSpeechNote }: CompanionVoiceWakeOptions) {
  const cloudConnection = useRef<RealtimeConnection | undefined>(undefined)
  const localMonitor = useRef<LocalVoiceLease | undefined>(undefined)
  const followUpTimer = useRef<number | undefined>(undefined)
  const sessionTimer = useRef<number | undefined>(undefined)
  const armed = useRef(false)
  const phase = useRef<VoiceConversationPhase>('sleeping')
  const interruptionPending = useRef(false)
  const bargeInStartedAt = useRef<number | undefined>(undefined)
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
      bargeInStartedAt.current = undefined
      window.clearTimeout(followUpTimer.current)
      window.clearTimeout(sessionTimer.current)
      return
    }
    let disposed = false
    let reconnectTimer: number | undefined
    let closingCloud = false
    let audio: ReturnType<typeof createPostWakeAudio> | undefined
    let sessionGeneration = 0
    let lastActivity = 0
    let localRetries = 0
    let cloudRetries = 0
    let localRetryTimer: number | undefined
    let bargeResumeTimer: number | undefined
    const echo = (text: string) => recentSpeech?.current.matches(text) ?? ((speechBusy.current || interruptionPending.current) && isLikelyPlaybackEcho(text, spokenText.current))

    const setVoiceActivity = (active: boolean) => {
      void emitTo('main', 'companion:voice-activity', { active })
    }
    const resumeInterruptedSpeech = () => {
      window.clearTimeout(bargeResumeTimer)
      bargeInStartedAt.current = undefined
      if (!interruptionPending.current) return
      interruptionPending.current = false
      if (speechBusy.current) void emitTo('main', 'companion:speech-pause', { paused: false })
    }

    const endConversation = (hide = false) => {
      window.clearTimeout(followUpTimer.current)
      window.clearTimeout(sessionTimer.current)
      window.clearTimeout(reconnectTimer)
      window.clearTimeout(bargeResumeTimer)
      sessionGeneration++
      audio?.close()
      audio = undefined
      localMonitor.current?.stop()
      localMonitor.current = undefined
      armed.current = false
      phase.current = 'sleeping'
      interruptionPending.current = false
      bargeInStartedAt.current = undefined
      setVoiceActivity(false)
      closingCloud = true
      cloudConnection.current?.close()
      cloudConnection.current = undefined
      void emitTo('main', 'companion:voice-session-ended', {})
      if (hide) void emitTo('main', 'companion:voice-hide-request', {})
      setSpeechNote(hide ? '伙伴已经隐藏，再叫醒我就好。' : `对话已结束，说“${voice.wakeWord}”可以再次唤醒。`)
      void startLocalListening()
    }
    const playFollowUpCue = () => {
      try {
        const context = new AudioContext()
        const oscillator = context.createOscillator()
        const gain = context.createGain()
        oscillator.frequency.value = 620
        gain.gain.setValueAtTime(0.018, context.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.08)
        oscillator.connect(gain)
        gain.connect(context.destination)
        oscillator.onended = () => { void context.close() }
        oscillator.start()
        oscillator.stop(context.currentTime + 0.08)
      } catch {
        // The visual listening note is enough when Windows blocks WebAudio.
      }
    }
    const scheduleConversationWindow = (afterTurn = false) => {
      window.clearTimeout(followUpTimer.current)
      let observedBusy = false
      let graceChecks = 0
      const waitUntilIdle = () => {
        if (disposed || !armed.current) return
        if (agentBusy.current || speechBusy.current) {
          observedBusy = true
          followUpTimer.current = window.setTimeout(waitUntilIdle, 350)
          return
        }
        if (afterTurn && !observedBusy && graceChecks < 5) {
          graceChecks += 1
          followUpTimer.current = window.setTimeout(waitUntilIdle, 250)
          return
        }
        if (afterTurn && voice.conversationMode === 'single') {
          endConversation()
          return
        }
        const windowMs = afterTurn ? followUpWindowMs(voice.conversationMode) : INITIAL_LISTENING_WINDOW_MS
        if (afterTurn) playFollowUpCue()
        setSpeechNote(afterTurn ? '还在听，' + Math.round(windowMs / 1000) + ' 秒内可以继续说。' : voice.wakeWord + '在听，请说出问题。')
        followUpTimer.current = window.setTimeout(() => {
          if (agentBusy.current || speechBusy.current || Date.now() - lastActivity < windowMs) waitUntilIdle()
          else endConversation()
        }, windowMs)
      }
      followUpTimer.current = window.setTimeout(waitUntilIdle, afterTurn ? 250 : 500)
    }
    const enforceSessionLimit = () => {
      if (disposed || !armed.current) return
      if (agentBusy.current || speechBusy.current || Date.now() - lastActivity < 3000) {
        sessionTimer.current = window.setTimeout(enforceSessionLimit, 500)
        return
      }
      endConversation()
    }
    const handleUtterance = (value: string) => {
      if (disposed || !armed.current) return
      const text = value.trim()
      if (!text) return
      bargeInStartedAt.current = undefined
      if (echo(text)) { setVoiceActivity(false); resumeInterruptedSpeech(); return }
      lastActivity = Date.now()
      const command = resolveVoiceCommand(text, voice.wakeWord)
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
      if (!isMeaningfulVoiceUtterance(text)) {
        setVoiceActivity(false)
        resumeInterruptedSpeech()
        phase.current = speechBusy.current ? 'speaking' : 'listening'
        setSpeechNote('没有把这段短声音当作问题，仍在等待。')
        return
      }
      if (isDuplicateUtterance(lastUtterance.current, text)) {
        setVoiceActivity(false)
        resumeInterruptedSpeech()
        return
      }
      lastUtterance.current = { text, at: Date.now() }
      const replacing = agentBusy.current || speechBusy.current || interruptionPending.current
      if (replacing) {
        phase.current = 'interrupted'
        void emitTo('main', 'companion:turn-stop', {})
        void emitTo('main', 'companion:speech-stop', {})
      }
      interruptionPending.current = false
      window.clearTimeout(bargeResumeTimer)
      bargeInStartedAt.current = undefined
      setVoiceActivity(false)
      phase.current = 'committing'
      scheduleConversationWindow(true)
      setSpeechNote(replacing ? '已打断上一条回答，正在处理新问题。' : '听到了，正在处理。')
      void emitTo('main', 'companion:chat-open-request', { presentation: 'voice' })
      void emitTo('main', 'companion:chat-send', { message: text, inputMode: 'voice', wake: true, replace: true })
    }
    const connectConversation = async () => {
      const generation = sessionGeneration
      const handoff = audio
      if (!handoff) return
      try {
        const token = await requestToken()
        if (disposed || !armed.current || generation !== sessionGeneration) return
        const connection = openVoiceRecognition(token, handoff, {
          active: () => !disposed && armed.current && generation === sessionGeneration && cloudConnection.current === connection,
          ready: () => { lastActivity = Date.now(); phase.current = 'listening'; setSpeechNote(`${voice.wakeWord}在听，请说出问题。`) },
          partial: (value) => {
          const partial = value.trim()
          if (!partial) return
          if (!echo(partial)) lastActivity = Date.now()
          phase.current = 'listening'
          setVoiceActivity(true)
          if (!speechBusy.current || echo(partial)) {
            bargeInStartedAt.current = undefined
            return
          }
          if (!hasBargeInSignal(partial)) return
          if (interruptionPending.current) {
            window.clearTimeout(bargeResumeTimer)
            bargeResumeTimer = window.setTimeout(resumeInterruptedSpeech, 8000)
            return
          }
          const now = Date.now()
          bargeInStartedAt.current ??= now
          if (now - bargeInStartedAt.current < BARGE_IN_CONFIRM_MS || interruptionPending.current) return
          interruptionPending.current = true
          bargeResumeTimer = window.setTimeout(resumeInterruptedSpeech, 8000)
          phase.current = 'interrupted'
          setSpeechNote('确认你在继续说，已暂停朗读。')
          void emitTo('main', 'companion:speech-pause', { paused: true })
        },
        committed: handleUtterance,
        error: (message) => {
          setVoiceActivity(false)
          resumeInterruptedSpeech()
          setSpeechNote(`语音聊天暂不可用：${message}`)
          connection.close()
        },
        closed: () => {
          setVoiceActivity(false)
          resumeInterruptedSpeech()
          if (cloudConnection.current === connection) cloudConnection.current = undefined
          if (disposed || closingCloud) {
            closingCloud = false
            return
          }
          if (armed.current) retryConnection()
        },
        })
        cloudConnection.current = connection
      } catch (error) {
        if (disposed || !armed.current || generation !== sessionGeneration) return
        setSpeechNote(`语音聊天暂不可用：${error instanceof Error ? error.message.replace(/^[A-Z_]+:/, '') : '请检查语音服务'}`)
        retryConnection()
      }
    }
    const retryConnection = () => {
      window.clearTimeout(reconnectTimer)
      if (++cloudRetries > 3) { endConversation(); setSpeechNote('语音连接连续失败，已返回本地待机；请检查网络和语音服务。'); return }
      reconnectTimer = window.setTimeout(() => void connectConversation(), 1500 * cloudRetries)
    }
    const activateConversation = () => {
      if (disposed || armed.current) return
      if (!localMonitor.current?.isActive()) return
      sessionGeneration++
      audio = createPostWakeAudio()
      localMonitor.current.handoff(audio.push)
      armed.current = true
      lastActivity = Date.now()
      cloudRetries = 0
      phase.current = 'listening'
      closingCloud = false
      void emitTo('main', 'companion:voice-show-request', {})
      void emitTo('main', 'companion:chat-open-request', { presentation: 'voice' })
      setSpeechNote(`${voice.wakeWord}听到了，请继续说问题。`)
      scheduleConversationWindow()
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
          if (disposed) return
          localRetries = 0
          if (!result.speakerMatched) {
            setSpeechNote(`听到了“${voice.wakeWord}”，但声纹没有通过。`)
            return
          }
          activateConversation()
        }, (error) => {
          if (disposed) return
          if (armed.current) { endConversation(); setSpeechNote('麦克风已中断，请检查输入设备后重新唤醒。'); return }
          localMonitor.current = undefined
          setSpeechNote(`本地唤醒暂不可用：${error instanceof Error ? error.message.replace(/^[A-Z_]+:/, '') : String(error)}`)
          if (++localRetries <= 3) localRetryTimer = window.setTimeout(() => void startLocalListening(), 2000 * localRetries)
        })
        if (disposed || armed.current || !monitor.isActive()) {
          monitor.stop()
          return
        }
        localMonitor.current = monitor
        setSpeechNote(`本地待机中，说“${voice.wakeWord}”唤醒。`)
      } catch (error) {
        if (!disposed) setSpeechNote(`本地唤醒暂不可用：${error instanceof Error ? error.message.replace(/^[A-Z_]+:/, '') : String(error)}`)
      }
    }
    const endRequested = (event: Event) => {
      if (!armed.current) return
      event.preventDefault()
      void emitTo('main', 'companion:turn-stop')
      void emitTo('main', 'companion:speech-stop')
      endConversation()
    }
    window.addEventListener('yiyu:voice-end', endRequested)
    void startLocalListening()
    return () => {
      window.removeEventListener('yiyu:voice-end', endRequested)
      disposed = true
      window.clearTimeout(reconnectTimer)
      window.clearTimeout(localRetryTimer)
      window.clearTimeout(bargeResumeTimer)
      sessionGeneration++
      audio?.close()
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
      bargeInStartedAt.current = undefined
      setVoiceActivity(false)
    }
  }, [agentBusy, recentSpeech, requestToken, setSpeechNote, speechBusy, spokenText, voice.conversationMode, voice.speakerVerification, voice.sttProviderId, voice.wakeEnabled, voice.wakeSensitivity, voice.wakeWord])
}
