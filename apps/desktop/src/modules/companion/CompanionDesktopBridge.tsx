import { emitTo, listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { LogicalSize, PhysicalPosition } from '@tauri-apps/api/dpi'
import { availableMonitors, getAllWindows, getCurrentWindow, type Monitor, type Window as TauriWindow } from '@tauri-apps/api/window'
import { register, unregister } from '@tauri-apps/plugin-global-shortcut'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CompanionVideoState } from '../../domain/models'
import { useLibraryStore } from '../../state/useLibraryStore'
import { companionDesktopSnapshot, companionVisualAssetIds } from './companionDesktop'
import { sendCompanionTurn } from './companionConversation'
import type { AgentRuntimeStatus } from './agent'
import { createSpeechToTextProvider, createTextToSpeechProvider } from '../../infrastructure/companionVoiceProvider'
import { toSpokenText } from './speechText'
import type { AgentPermissionRequest } from './agent/types'
import { assertExternalAiAllowed } from '../trust/trustPolicy'
import { PrivacySession, type PrivacyReviewRequest } from '../privacy'

const isTauri = () => '__TAURI_INTERNALS__' in window
const chatWindowWidth = 350
const chatWindowHeight = 480

function playAudioBlob(blob: Blob, audioRef: { current: HTMLAudioElement | undefined }) {
  return new Promise<void>((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    audioRef.current = audio
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      if (audioRef.current === audio) audioRef.current = undefined
      URL.revokeObjectURL(url)
      resolve()
    }
    audio.onended = finish
    audio.onerror = () => {
      if (settled) return
      settled = true
      if (audioRef.current === audio) audioRef.current = undefined
      URL.revokeObjectURL(url)
      reject(new Error('VOICE_PLAYBACK_FAILED:语音播放失败'))
    }
    void audio.play().catch((error) => {
      if (settled) return
      settled = true
      if (audioRef.current === audio) audioRef.current = undefined
      URL.revokeObjectURL(url)
      reject(error)
    })
  })
}

function nearestMonitor(monitors: Monitor[], x: number, y: number) {
  return monitors.reduce<Monitor | undefined>((nearest, monitor) => {
    if (!nearest) return monitor
    const distance = (candidate: Monitor) => {
      const area = candidate.workArea
      return Math.hypot(x - (area.position.x + area.size.width / 2), y - (area.position.y + area.size.height / 2))
    }
    return distance(monitor) < distance(nearest) ? monitor : nearest
  }, undefined)
}

async function positionCompanionChat(portrait: TauriWindow, chat: TauriWindow) {
  await chat.setSize(new LogicalSize(chatWindowWidth, chatWindowHeight))
  const [position, size, monitors] = await Promise.all([portrait.outerPosition(), portrait.outerSize(), availableMonitors()])
  const monitor = nearestMonitor(monitors, position.x + size.width / 2, position.y + size.height / 2)
  if (!monitor) return
  const area = monitor.workArea
  const chatWidth = Math.round(chatWindowWidth * monitor.scaleFactor)
  const chatHeight = Math.round(chatWindowHeight * monitor.scaleFactor)
  const opensLeft = position.x - chatWidth >= area.position.x
  const desiredX = opensLeft ? position.x - chatWidth : position.x + size.width
  const maxX = Math.max(area.position.x, area.position.x + area.size.width - chatWidth)
  const maxY = Math.max(area.position.y, area.position.y + area.size.height - chatHeight)
  await chat.setPosition(new PhysicalPosition(
    Math.min(maxX, Math.max(area.position.x, desiredX)),
    Math.min(maxY, Math.max(area.position.y, position.y)),
  ))
}

export function CompanionDesktopBridge() {
  const { data, playback, setCompanionDesktop, setCompanionPersonality, clearCompanionMessages } = useLibraryStore()
  const learnedTrack = useRef<string | undefined>(undefined)
  const sending = useRef(false)
  const spokenAudio = useRef<HTMLAudioElement | undefined>(undefined)
  const resetStateTimer = useRef<number | undefined>(undefined)
  const chatVisible = useRef(false)
  const chatTogglePending = useRef(false)
  const permissionRequests = useRef(new Map<string, (allowed: boolean) => void>())
  const privacyRequests = useRef(new Map<string, (allowed: boolean) => void>())
  const speechGeneration = useRef(0)
  const activeTurn = useRef<AbortController | undefined>(undefined)
  const [visualState, setVisualState] = useState<CompanionVideoState>()
  const [agentStatus, setAgentStatus] = useState<AgentRuntimeStatus>()
  const snapshot = useMemo(() => companionDesktopSnapshot(data.companion, data.session.activeView, playback.playing, data.assets, visualState, agentStatus, data.settings.trust.externalAiProcessing), [data.companion, data.session.activeView, playback.playing, data.assets, visualState, agentStatus, data.settings.trust.externalAiProcessing])
  const snapshotRef = useRef(snapshot)
  snapshotRef.current = snapshot
  const publish = useCallback(async (nextSnapshot = snapshotRef.current) => {
    await invoke('set_companion_asset_scope', { ids: companionVisualAssetIds(nextSnapshot) })
    await Promise.all([
      emitTo('companion', 'companion:snapshot', nextSnapshot),
      emitTo('companion-chat', 'companion:snapshot', nextSnapshot),
    ])
  }, [])
  useEffect(() => {
    if (!isTauri()) return
    void publish(snapshot)
  }, [publish, snapshot])
  useEffect(() => {
    if (!isTauri()) return
    let stopHide: (() => void) | undefined; let stopOpen: (() => void) | undefined; let stopReady: (() => void) | undefined; let stopToggleChat: (() => void) | undefined; let stopOpenChat: (() => void) | undefined; let stopMoved: (() => void) | undefined; let stopChat: (() => void) | undefined; let stopNewChat: (() => void) | undefined; let stopVoice: (() => void) | undefined; let stopVoiceToken: (() => void) | undefined; let stopPermission: (() => void) | undefined; let stopPrivacy: (() => void) | undefined; let stopSpeech: (() => void) | undefined; let stopSpeechPause: (() => void) | undefined; let stopTurn: (() => void) | undefined
    const windows = async () => {
      const all = await getAllWindows()
      return { portrait: all.find((item) => item.label === 'companion'), chat: all.find((item) => item.label === 'companion-chat') }
    }
    const showChat = async (draft?: string) => {
      const pair = await windows()
      if (!pair.portrait || !pair.chat) return
      await positionCompanionChat(pair.portrait, pair.chat)
      if (draft !== undefined) await emitTo('companion-chat', 'companion:open-chat', { draft })
      await pair.chat.show()
      chatVisible.current = true
      await pair.chat.setFocus().catch(() => undefined)
    }
    const cancelActiveTurn = () => {
      activeTurn.current?.abort()
      activeTurn.current = undefined
      sending.current = false
      permissionRequests.current.forEach((resolve) => resolve(false))
      permissionRequests.current.clear()
      privacyRequests.current.forEach((resolve) => resolve(false))
      privacyRequests.current.clear()
      speechGeneration.current += 1
      const audio = spokenAudio.current
      audio?.pause()
      audio?.dispatchEvent(new Event('ended'))
      setAgentStatus(undefined)
      setVisualState(undefined)
      void emitTo('companion-chat', 'companion:stream-text', { text: '' })
      void emitTo('companion-chat', 'companion:speech-state', { active: false, paused: false })
    }
    void listen('companion:hide-request', () => setCompanionDesktop(false)).then((stop) => { stopHide = stop })
    void listen('companion:open-main', () => { void getCurrentWindow().show(); void getCurrentWindow().setFocus() }).then((stop) => { stopOpen = stop })
    void listen('companion:ready', () => { void publish() }).then((stop) => { stopReady = stop })
    void listen('companion:chat-toggle', () => {
      if (chatTogglePending.current) return
      chatTogglePending.current = true
      void windows().then(async (pair) => {
        if (!pair.chat) return
        const visible = await pair.chat.isVisible().catch(() => chatVisible.current)
        if (visible) {
          chatVisible.current = false
          await pair.chat.hide()
          return
        }
        await showChat()
      }).finally(() => { chatTogglePending.current = false })
    }).then((stop) => { stopToggleChat = stop })
    void listen<{ draft?: string }>('companion:chat-open-request', (event) => { void showChat(event.payload.draft) }).then((stop) => { stopOpenChat = stop })
    void listen('companion:moved', () => {
      if (!chatVisible.current) return
      void windows().then((pair) => pair.portrait && pair.chat ? positionCompanionChat(pair.portrait, pair.chat) : undefined)
    }).then((stop) => { stopMoved = stop })
    void listen<{ requestId: string; allowed: boolean }>('companion:permission-response', (event) => {
      const resolve = permissionRequests.current.get(event.payload.requestId)
      if (!resolve) return
      permissionRequests.current.delete(event.payload.requestId)
      resolve(event.payload.allowed)
    }).then((stop) => { stopPermission = stop })
    void listen<{ requestId: string; allowed: boolean }>('companion:privacy-review-response', (event) => {
      const resolve = privacyRequests.current.get(event.payload.requestId)
      if (!resolve) return
      privacyRequests.current.delete(event.payload.requestId)
      resolve(event.payload.allowed)
    }).then((stop) => { stopPrivacy = stop })
    void listen('companion:speech-stop', () => {
      speechGeneration.current += 1
      const audio = spokenAudio.current
      audio?.pause()
      audio?.dispatchEvent(new Event('ended'))
      setVisualState(undefined)
      void emitTo('companion-chat', 'companion:speech-state', { active: false, paused: false })
    }).then((stop) => { stopSpeech = stop })
    void listen<{ paused: boolean }>('companion:speech-pause', (event) => {
      const audio = spokenAudio.current
      if (!audio) return
      if (event.payload.paused) audio.pause()
      else void audio.play()
      void emitTo('companion-chat', 'companion:speech-state', { active: true, paused: event.payload.paused })
    }).then((stop) => { stopSpeechPause = stop })
    void listen('companion:turn-stop', () => {
      cancelActiveTurn()
    }).then((stop) => { stopTurn = stop })
    void listen<{ message: string; inputMode?: 'text' | 'voice'; wake?: boolean; replace?: boolean; requestId?: string }>('companion:chat-send', (event) => {
      if (!event.payload.message.trim()) return
      if (sending.current) {
        if (!event.payload.replace) return
        cancelActiveTurn()
      }
      sending.current = true
      const turn = new AbortController()
      activeTurn.current = turn
      if (event.payload.requestId) {
        void emitTo('companion-chat', 'companion:chat-send-accepted', { requestId: event.payload.requestId })
      }
      void emitTo('companion-chat', 'companion:stream-text', { text: '' })
      const voice = useLibraryStore.getState().data.companion.voice
      const trust = useLibraryStore.getState().data.settings.trust
      if (!trust.retainConversationHistory) {
        void emitTo('companion-chat', 'companion:transient-message', { role: 'user', content: event.payload.message })
      }
      const externalVoiceAllowed = voice.tts.providerId === 'none' || trust.externalAiProcessing
      const speechEnabled = externalVoiceAllowed && (voice.autoSpeak || event.payload.wake) && voice.tts.providerId !== 'none' && Boolean(voice.tts.voice)
      const speechLimit = voice.longReplySpeech === 'full' ? Number.POSITIVE_INFINITY : 220
      const speechProvider = speechEnabled ? createTextToSpeechProvider(voice.tts) : undefined
      const speechPrivacy = new PrivacySession(trust.privateDictionary)
      const speechId = ++speechGeneration.current
      let speechBuffer = ''
      let speechQueue = Promise.resolve()
      let spokenCharacters = 0
      let speechClosed = false
      let speechNoteSent = false
      const closeLongSpeech = () => {
        if (speechClosed) return
        speechClosed = true
        if (!speechNoteSent) {
          speechNoteSent = true
          void emitTo('companion-chat', 'companion:speech-note', { message: '回答较长，其余内容已静默呈现。' })
        }
      }
      const queueSpeech = (text: string) => {
        const spoken = toSpokenText(text)
        if (!speechProvider || !spoken || speechClosed || speechId !== speechGeneration.current) return
        if (spokenCharacters > 0 && spokenCharacters + spoken.length > speechLimit) { closeLongSpeech(); return }
        spokenCharacters += spoken.length
        speechQueue = speechQueue.then(async () => {
          if (speechId !== speechGeneration.current) return
          window.clearTimeout(resetStateTimer.current)
          setVisualState('speaking')
          void emitTo('companion-chat', 'companion:speech-state', { active: true, paused: false })
          const blob = await speechProvider.synthesize(trust.outboundProtection ? speechPrivacy.sanitize(spoken).text : spoken)
          if (speechId !== speechGeneration.current) return
          await playAudioBlob(blob, spokenAudio)
        })
      }
      const flushSpeech = (final = false) => {
        let match = speechBuffer.match(/^([\s\S]*?)([。！？!?；;]|\n\n)/)
        while (match) {
          queueSpeech(`${match[1]}${match[2]}`)
          speechBuffer = speechBuffer.slice(match[0].length)
          if (match[2] === '\n\n') closeLongSpeech()
          match = speechBuffer.match(/^([\s\S]*?)([。！？!?；;]|\n\n)/)
        }
        if (final && speechBuffer.trim()) { queueSpeech(speechBuffer); speechBuffer = '' }
      }
      void sendCompanionTurn(event.payload.message, {
        onStatus: (status) => { if (activeTurn.current === turn) setAgentStatus(status) },
        onTextDelta: (delta) => {
          void emitTo('companion-chat', 'companion:stream-text', { text: delta, append: true })
          speechBuffer += delta
          flushSpeech()
        },
        onVisualState: (state) => {
          if (activeTurn.current !== turn) return
          window.clearTimeout(resetStateTimer.current)
          setVisualState(state)
          resetStateTimer.current = window.setTimeout(() => setVisualState(undefined), 6000)
        },
        inputMode: event.payload.inputMode ?? 'text',
        voiceReplyLength: event.payload.wake ? 'short' : voice.replyLength,
        signal: turn.signal,
        requestPermission: (request: AgentPermissionRequest) => new Promise((resolve) => {
          const requestId = crypto.randomUUID()
          permissionRequests.current.set(requestId, resolve)
          void emitTo('companion-chat', 'companion:permission-request', { requestId, request })
          window.setTimeout(() => {
            const pending = permissionRequests.current.get(requestId)
            if (!pending) return
            permissionRequests.current.delete(requestId)
            pending(false)
          }, 120_000)
        }),
        requestPrivacyReview: (request: PrivacyReviewRequest) => new Promise((resolve) => {
          const requestId = crypto.randomUUID()
          privacyRequests.current.set(requestId, resolve)
          void emitTo('companion-chat', 'companion:privacy-review-request', { requestId, request })
          window.setTimeout(() => {
            const pending = privacyRequests.current.get(requestId)
            if (!pending) return
            privacyRequests.current.delete(requestId)
            pending(false)
          }, 120_000)
        }),
      }).then((responseText) => {
        if (turn.signal.aborted) return
        if (!trust.retainConversationHistory) {
          void emitTo('companion-chat', 'companion:transient-message', { role: 'companion', content: responseText })
        }
        flushSpeech(true)
        void emitTo('companion-chat', 'companion:stream-text', { text: '' })
        if (!speechProvider) return
        setAgentStatus({ phase: 'responding' })
        return speechQueue
          .catch((error) => emitTo('companion-chat', 'companion:voice-error', { message: error instanceof Error ? error.message : '语音朗读失败' }))
          .finally(() => { if (speechId === speechGeneration.current) { void emitTo('companion-chat', 'companion:speech-state', { active: false }); setVisualState(undefined); setAgentStatus(undefined) } })
      }).catch((error) => {
        if (turn.signal.aborted) return
        setAgentStatus({ phase: 'error', message: error instanceof Error ? error.message : '伙伴暂时无法回应' })
        window.clearTimeout(resetStateTimer.current)
        resetStateTimer.current = window.setTimeout(() => setAgentStatus(undefined), 6000)
      }).finally(() => {
        if (activeTurn.current === turn) {
          activeTurn.current = undefined
          sending.current = false
          void emitTo('companion-chat', 'companion:stream-text', { text: '' })
        }
      })
    }).then((stop) => { stopChat = stop })
    void listen('companion:new-chat', () => {
      if (sending.current) return
      clearCompanionMessages()
      void emitTo('companion-chat', 'companion:transient-clear')
      setAgentStatus(undefined)
      setVisualState(undefined)
    }).then((stop) => { stopNewChat = stop })
    void listen<{ audio: number[]; mimeType: string }>('companion:voice-transcribe', (event) => {
      const current = useLibraryStore.getState().data
      const voice = current.companion.voice
      try { assertExternalAiAllowed(voice.stt.providerId, current.settings.trust, 'voice') }
      catch (error) { void emitTo('companion', 'companion:voice-error', { message: error instanceof Error ? error.message : String(error) }); return }
      setVisualState('listening')
      void createSpeechToTextProvider(voice.stt).transcribe(new Blob([new Uint8Array(event.payload.audio)], { type: event.payload.mimeType }))
        .then((text) => emitTo('companion', 'companion:voice-transcript', { text }))
        .catch((error) => emitTo('companion', 'companion:voice-error', { message: error instanceof Error ? error.message : '语音识别失败' }))
        .finally(() => setVisualState(undefined))
    }).then((stop) => { stopVoice = stop })
    void listen<{ requestId: string }>('companion:voice-token-request', (event) => {
      const current = useLibraryStore.getState().data
      const voice = current.companion.voice
      try { assertExternalAiAllowed(voice.stt.providerId, current.settings.trust, 'voice') }
      catch (error) { void emitTo('companion-chat', 'companion:voice-token-response', { requestId: event.payload.requestId, error: error instanceof Error ? error.message : String(error) }); return }
      if (voice.stt.providerId !== 'elevenlabs') {
        void emitTo('companion-chat', 'companion:voice-token-response', { requestId: event.payload.requestId, error: '当前语音识别服务不支持实时转写' })
        return
      }
      void invoke<string>('elevenlabs_realtime_scribe_token')
        .then((token) => emitTo('companion-chat', 'companion:voice-token-response', { requestId: event.payload.requestId, token }))
        .catch((error) => emitTo('companion-chat', 'companion:voice-token-response', { requestId: event.payload.requestId, error: error instanceof Error ? error.message : String(error) }))
    }).then((stop) => { stopVoiceToken = stop })
    return () => { stopHide?.(); stopOpen?.(); stopReady?.(); stopToggleChat?.(); stopOpenChat?.(); stopMoved?.(); stopChat?.(); stopNewChat?.(); stopVoice?.(); stopVoiceToken?.(); stopPermission?.(); stopPrivacy?.(); stopSpeech?.(); stopSpeechPause?.(); stopTurn?.(); activeTurn.current?.abort(); permissionRequests.current.forEach((resolve) => resolve(false)); permissionRequests.current.clear(); privacyRequests.current.forEach((resolve) => resolve(false)); privacyRequests.current.clear(); speechGeneration.current += 1; const audio = spokenAudio.current; audio?.pause(); audio?.dispatchEvent(new Event('ended')); window.clearTimeout(resetStateTimer.current) }
  }, [clearCompanionMessages, publish, setCompanionDesktop])
  useEffect(() => {
    if (!isTauri()) return
    void getAllWindows().then(async (windows) => {
      const desktop = windows.find((item) => item.label === 'companion')
      const chat = windows.find((item) => item.label === 'companion-chat')
      if (!desktop) return
      await publish()
      if (data.companion.desktop.visible) await desktop.show(); else {
        chatVisible.current = false
        await Promise.all([desktop.hide(), chat?.hide()])
      }
    })
  }, [data.companion.desktop.visible, publish])
  useEffect(() => {
    if (!isTauri()) return
    const shortcut = data.companion.desktop.toggleShortcut
    if (!shortcut) {
      window.localStorage.removeItem('yiyu:companion-shortcut-status')
      return
    }
    let disposed = false
    const report = (message: string) => {
      window.localStorage.setItem('yiyu:companion-shortcut-status', message)
      window.dispatchEvent(new CustomEvent('yiyu:companion-shortcut-status', { detail: message }))
    }
    void unregister(shortcut).catch(() => undefined).then(() => {
      if (disposed) return
      return register(shortcut, (event) => {
        if (event.state !== 'Pressed') return
        const store = useLibraryStore.getState()
        store.setCompanionDesktop(!store.data.companion.desktop.visible)
      })
    }).then(() => {
      if (!disposed) report('全局快捷键已启用。')
    }).catch((error) => {
      if (!disposed) report(error instanceof Error ? `快捷键注册失败：${error.message}` : '快捷键注册失败，可能已被其他程序占用。')
    })
    return () => { disposed = true; void unregister(shortcut).catch(() => undefined) }
  }, [data.companion.desktop.toggleShortcut])
  useEffect(() => {
    const trackId = data.session.currentTrackId
    if (!trackId || !playback.playing || learnedTrack.current === trackId || !data.companion.growth.enabled || !data.companion.permissions.musicContext) return
    learnedTrack.current = trackId
    setCompanionPersonality({ curiosity: data.companion.personality.curiosity + 1 }, '已授权的音乐偏好互动')
  }, [data.session.currentTrackId, playback.playing, data.companion.growth.enabled, data.companion.permissions.musicContext, data.companion.personality.curiosity, setCompanionPersonality])
  return null
}
