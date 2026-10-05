import { useChatPresentationBridge } from './useChatPresentationBridge'
import { needsTaskConfirmation } from './feedback/taskFeedback'
import type { ChatPresentation } from './chatPresentation'
import { positionCompanionChat } from './companionChatLayout'
import { useTaskFeedbackBridge } from './feedback/useTaskFeedbackBridge'
import { emitTo, listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { getAllWindows, getCurrentWindow } from '@tauri-apps/api/window'
import { usePetMenuActions } from './pixel-pet/usePetMenuActions'
import { usePetPoseSync } from './pixel-pet/usePetPoseSync'
import { usePetModeShortcut } from './pixel-pet/usePetModeShortcut'
import { register, unregister } from '@tauri-apps/plugin-global-shortcut'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CompanionDesktopMode, CompanionVideoState } from '../../domain/models'
import { useLibraryStore } from '../../state/useLibraryStore'
import { companionDesktopSnapshot, companionVisualAssetIds } from './companionDesktop'
import { sendCompanionTurn } from './companionConversation'
import { configuredClipsForState, isTransientVideoState } from './companionVideoPlayback'
import type { AgentRuntimeStatus } from './agent'
import { createSpeechToTextProvider, createTextToSpeechProvider } from '../../infrastructure/companionVoiceProvider'
import { syncBackgroundRuntime } from '../../infrastructure/backgroundRuntime'
import { createComputerService } from '../../infrastructure/computerService'
import { createReplySpeechQueue, playAudioBlob } from './companionReplySpeech'
import type { AgentPermissionRequest } from './agent/types'
import { assertExternalAiAllowed } from '../trust/trustPolicy'
import { PrivacySession, type PrivacyReviewRequest } from '../privacy'
import { usePlannerNotifications } from './usePlannerNotifications'

const isTauri = () => '__TAURI_INTERNALS__' in window

export function CompanionDesktopBridge() {
  const { data, playback, setCompanionDesktop, setCompanionPersonality, clearCompanionMessages } = useLibraryStore()
  usePlannerNotifications(data)
  const learnedTrack = useRef<string | undefined>(undefined)
  const sending = useRef(false)
  const spokenAudio = useRef<HTMLAudioElement | undefined>(undefined)
  const resetStateTimer = useRef<number | undefined>(undefined)
  const wasDesktopVisible = useRef(false)
  const lastGreetingAt = useRef(0)
  const chatVisible = useRef(false)
  const chatPresentation = useRef<ChatPresentation>('full')
  useChatPresentationBridge(chatVisible, chatPresentation)
  const chatTogglePending = useRef(false)
  const quietShortcutRestoreMode = useRef<Exclude<CompanionDesktopMode, 'quiet'>>('interactive')
  const permissionRequests = useRef(new Map<string, (allowed: boolean) => void>())
  const privacyRequests = useRef(new Map<string, (allowed: boolean) => void>())
  const speechGeneration = useRef(0)
  const activeTurn = useRef<AbortController | undefined>(undefined)
  const [visualState, setVisualState] = useState<CompanionVideoState>()
  const visualStateRef = useRef<CompanionVideoState | undefined>(undefined)
  visualStateRef.current = visualState
  const [desktopModeOverride, setDesktopModeOverride] = useState<CompanionDesktopMode>()
  const switchPetMode = useCallback((pixel: boolean) => setDesktopModeOverride(pixel ? 'interactive' : undefined), [])
  usePetPoseSync()
  usePetMenuActions()
  usePetModeShortcut(data.companion.desktop.toggleShortcut, data.companion.desktop.quietShortcut, data.companion.computer.enabled ? data.companion.computer.emergencyShortcut : '', switchPetMode)
  const [agentStatus, setAgentStatus] = useState<AgentRuntimeStatus>()
  const snapshot = useMemo(() => companionDesktopSnapshot(data.companion, data.session.activeView, playback.playing, data.assets, visualState, agentStatus, data.settings.trust.externalAiProcessing, desktopModeOverride), [data.companion, data.session.activeView, playback.playing, data.assets, visualState, agentStatus, data.settings.trust.externalAiProcessing, desktopModeOverride])
  useEffect(() => {
    void syncBackgroundRuntime(data.companion.voice.wakeEnabled || data.companion.computer.backgroundReminders).catch((error) => {
      console.warn('Unable to synchronize background voice wake:', error)
    })
  }, [data.companion.voice.wakeEnabled, data.companion.computer.backgroundReminders])
  const taskDetailsOpened = useCallback(() => { setDesktopModeOverride('interactive'); chatVisible.current = true }, [])
  useTaskFeedbackBridge(snapshot, taskDetailsOpened)
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
    let stopHide: (() => void) | undefined; let stopOpen: (() => void) | undefined; let stopReady: (() => void) | undefined; let stopTransient: (() => void) | undefined; let stopToggleChat: (() => void) | undefined; let stopOpenChat: (() => void) | undefined; let stopMoved: (() => void) | undefined; let stopChat: (() => void) | undefined; let stopNewChat: (() => void) | undefined; let stopVoice: (() => void) | undefined; let stopVoiceActivity: (() => void) | undefined; let stopVoiceToken: (() => void) | undefined; let stopPermission: (() => void) | undefined; let stopPrivacy: (() => void) | undefined; let stopSpeech: (() => void) | undefined; let stopSpeechPause: (() => void) | undefined; let stopTurn: (() => void) | undefined; let stopVoiceShow: (() => void) | undefined; let stopVoiceEnd: (() => void) | undefined; let stopVoiceHide: (() => void) | undefined; let stopTray: (() => void) | undefined; let stopTaskControl: (() => void) | undefined; let stopTaskSpeech: (() => void) | undefined
    const windows = async () => {
      const all = await getAllWindows()
      return { portrait: all.find((item) => item.label === 'companion'), chat: all.find((item) => item.label === 'companion-chat') }
    }
    const showChat = async (draft?: string, presentation?: ChatPresentation) => {
      chatPresentation.current = presentation ?? (snapshotRef.current.pixelPetEnabled ? 'bubble' : 'full')
      setDesktopModeOverride('interactive')
      const pair = await windows()
      if (!pair.portrait || !pair.chat) return
      await positionCompanionChat(pair.portrait, pair.chat, chatPresentation.current)
      await emitTo('companion-chat', 'companion:chat-presentation', { mode: chatPresentation.current })
      if (draft !== undefined) await emitTo('companion-chat', 'companion:open-chat', { draft })
      await pair.chat.show()
      chatVisible.current = true
      if (chatPresentation.current === 'full') await pair.chat.setFocus().catch(() => undefined)
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
    void listen('companion:voice-show-request', () => {
      window.clearTimeout(resetStateTimer.current)
      setVisualState('listening')
      setDesktopModeOverride('interactive')
      setCompanionDesktop(true)
    }).then((stop) => { stopVoiceShow = stop })
    void listen('companion:voice-session-ended', () => {
      if (visualStateRef.current === 'listening') setVisualState(undefined)
      setDesktopModeOverride(undefined)
      if (permissionRequests.current.size || privacyRequests.current.size || (snapshotRef.current.task && needsTaskConfirmation(snapshotRef.current.task))) return
      chatVisible.current = false
      void windows().then((pair) => pair.chat?.hide())
    }).then((stop) => { stopVoiceEnd = stop })
    void listen('companion:voice-hide-request', () => {
      setDesktopModeOverride(undefined)
      setCompanionDesktop(false)
    }).then((stop) => { stopVoiceHide = stop })
    void listen<string>('companion:tray-action', (event) => {
      if (event.payload === 'interactive') { setDesktopModeOverride('interactive'); setCompanionDesktop(true); void showChat(); return }
      if (event.payload === 'quiet') { setDesktopModeOverride('quiet'); setCompanionDesktop(true); chatVisible.current = false; void windows().then((pair) => pair.chat?.hide()); return }
      if (event.payload === 'hide') { setDesktopModeOverride(undefined); setCompanionDesktop(false) }
    }).then((stop) => { stopTray = stop })
    void listen('companion:open-main', () => { void getCurrentWindow().show(); void getCurrentWindow().setFocus() }).then((stop) => { stopOpen = stop })
    void listen('companion:ready', () => { void publish() }).then((stop) => { stopReady = stop })
    void listen<{ state: CompanionVideoState }>('companion:transient-ended', (event) => {
      if (visualStateRef.current !== event.payload.state || !isTransientVideoState(event.payload.state)) return
      window.clearTimeout(resetStateTimer.current)
      setVisualState(undefined)
    }).then((stop) => { stopTransient = stop })
    void listen('companion:chat-toggle', () => {
      if (chatTogglePending.current) return
      chatTogglePending.current = true
      void windows().then(async (pair) => {
        if (!pair.chat) return
        const visible = await pair.chat.isVisible().catch(() => chatVisible.current)
        if (visible) {
          chatVisible.current = false
          setDesktopModeOverride(undefined)
          await pair.chat.hide()
          return
        }
        await showChat()
      }).finally(() => { chatTogglePending.current = false })
    }).then((stop) => { stopToggleChat = stop })
    void listen<{ draft?: string; presentation?: ChatPresentation }>('companion:chat-open-request', (event) => { void showChat(event.payload.draft, event.payload.presentation === 'voice' ? 'voice' : undefined) }).then((stop) => { stopOpenChat = stop })
    void listen('companion:moved', () => {
      if (!chatVisible.current) return
      void windows().then((pair) => pair.portrait && pair.chat ? positionCompanionChat(pair.portrait, pair.chat, chatPresentation.current) : undefined)
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
      setAgentStatus(undefined)
      void emitTo('companion-chat', 'companion:speech-state', { active: false, paused: false })
    }).then((stop) => { stopSpeech = stop })
    void listen<{ paused: boolean }>('companion:speech-pause', (event) => {
      const audio = spokenAudio.current
      if (!audio) return
      if (event.payload.paused) audio.pause()
      else { setVisualState('speaking'); void audio.play() }
      void emitTo('companion-chat', 'companion:speech-state', { active: true, paused: event.payload.paused })
    }).then((stop) => { stopSpeechPause = stop })
    void listen<{ active: boolean }>('companion:voice-activity', (event) => {
      if (event.payload.active) setVisualState('listening')
      else if (visualStateRef.current === 'listening') setVisualState(undefined)
    }).then((stop) => { stopVoiceActivity = stop })
    void listen('companion:turn-stop', () => {
      cancelActiveTurn()
    }).then((stop) => { stopTurn = stop })
    void listen<{ id: string; action: 'pause' | 'resume' | 'confirm' | 'cancel' }>('companion:task-control', (event) => {
      const store = useLibraryStore.getState()
      if (event.payload.action === 'pause') store.pauseAgentTask(event.payload.id)
      else if (event.payload.action === 'resume') store.resumeAgentTask(event.payload.id)
      else if (event.payload.action === 'confirm') store.confirmAgentTaskStep(event.payload.id)
      else store.cancelAgentTask(event.payload.id)
    }).then((stop) => { stopTaskControl = stop })
    void listen<{ active: boolean }>('companion:task-speech-state', (event) => {
      window.clearTimeout(resetStateTimer.current)
      setVisualState(event.payload.active ? 'speaking' : undefined)
    }).then((stop) => { stopTaskSpeech = stop })

    void listen<{ message: string; inputMode?: 'text' | 'voice'; wake?: boolean; replace?: boolean; requestId?: string }>('companion:chat-send', (event) => {
      if (!event.payload.message.trim()) return
      if (sending.current) {
        if (!event.payload.replace) return
        cancelActiveTurn()
      }
      sending.current = true
      window.clearTimeout(resetStateTimer.current)
      setVisualState(undefined)
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
      let responseVisualState: CompanionVideoState | undefined
      const showResponseVisual = () => {
        if (turn.signal.aborted || speechId !== speechGeneration.current) return
        window.clearTimeout(resetStateTimer.current)
        setAgentStatus(undefined)
        setVisualState(responseVisualState)
        if (responseVisualState && responseVisualState !== 'idle') {
          resetStateTimer.current = window.setTimeout(() => setVisualState(undefined), isTransientVideoState(responseVisualState) ? 15_000 : responseVisualState === 'sleepy' ? 60_000 : 6000)
        }
      }
      const speechQueue = createReplySpeechQueue({
        provider: speechProvider,
        limit: speechLimit,
        sanitize: (text) => trust.outboundProtection ? speechPrivacy.sanitize(text).text : text,
        isActive: () => speechId === speechGeneration.current,
        onLimit: () => { void emitTo('companion-chat', 'companion:speech-note', { message: '回答较长，其余内容已静默呈现。' }) },
        play: async (blob, spoken) => {
          window.clearTimeout(resetStateTimer.current)
          setVisualState('speaking')
          void emitTo('companion-chat', 'companion:speech-state', { active: true, paused: false, text: spoken })
          await playAudioBlob(blob, spokenAudio)
        },
      })
      void sendCompanionTurn(event.payload.message, {
        onStatus: (status) => { if (activeTurn.current === turn) setAgentStatus(status) },
        onTextDelta: (delta) => {
          void emitTo('companion-chat', 'companion:stream-text', { text: delta, append: true })
        },
        onTextReset: () => {
          void emitTo('companion-chat', 'companion:stream-text', { text: '' })
        },
        onVisualState: (state) => {
          if (activeTurn.current !== turn) return
          responseVisualState = state
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
        const taskActive = useLibraryStore.getState().data.companion.tasks.some((task) => ['queued', 'preparing', 'running'].includes(task.status))
        if (taskActive) {
          setAgentStatus(undefined)
          return
        }
        const spokenReply = speechQueue.speak(responseText)
        void emitTo('companion-chat', 'companion:stream-text', { text: '' })
        if (!speechProvider) { showResponseVisual(); return }
        setAgentStatus({ phase: 'responding' })
        return spokenReply
          .catch((error) => emitTo('companion-chat', 'companion:voice-error', { message: error instanceof Error ? error.message : '语音朗读失败' }))
          .finally(() => { if (speechId === speechGeneration.current) { void emitTo('companion-chat', 'companion:speech-state', { active: false }); showResponseVisual() } })
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
      catch (error) { void emitTo('companion-chat', 'companion:voice-error', { message: error instanceof Error ? error.message : String(error) }); return }
      setVisualState('listening')
      void createSpeechToTextProvider(voice.stt).transcribe(new Blob([new Uint8Array(event.payload.audio)], { type: event.payload.mimeType }))
        .then((text) => emitTo('companion-chat', 'companion:voice-transcript', { text }))
        .catch((error) => emitTo('companion-chat', 'companion:voice-error', { message: error instanceof Error ? error.message : '语音识别失败' }))
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount must clean the latest in-flight resources stored in refs.
    return () => { stopHide?.(); stopOpen?.(); stopReady?.(); stopTransient?.(); stopToggleChat?.(); stopOpenChat?.(); stopMoved?.(); stopChat?.(); stopNewChat?.(); stopVoice?.(); stopVoiceActivity?.(); stopVoiceToken?.(); stopPermission?.(); stopPrivacy?.(); stopSpeech?.(); stopSpeechPause?.(); stopTurn?.(); stopVoiceShow?.(); stopVoiceEnd?.(); stopVoiceHide?.(); stopTray?.(); stopTaskControl?.(); stopTaskSpeech?.(); activeTurn.current?.abort(); permissionRequests.current.forEach((resolve) => resolve(false)); permissionRequests.current.clear(); privacyRequests.current.forEach((resolve) => resolve(false)); privacyRequests.current.clear(); speechGeneration.current += 1; const audio = spokenAudio.current; audio?.pause(); audio?.dispatchEvent(new Event('ended')); window.clearTimeout(resetStateTimer.current) }
  }, [clearCompanionMessages, publish, setCompanionDesktop])
  useEffect(() => {
    if (!isTauri()) return
    const visible = data.companion.desktop.visible
    const becameVisible = visible && !wasDesktopVisible.current
    wasDesktopVisible.current = visible
    if (becameVisible && !snapshotRef.current.pixelPetEnabled && visualStateRef.current !== 'listening' && Date.now() - lastGreetingAt.current >= 2 * 60 * 60 * 1000 && configuredClipsForState(snapshotRef.current.visual, 'greeting').length > 0) {
      lastGreetingAt.current = Date.now()
      window.clearTimeout(resetStateTimer.current)
      setVisualState('greeting')
    }
    void getAllWindows().then(async (windows) => {
      const desktop = windows.find((item) => item.label === 'companion')
      const chat = windows.find((item) => item.label === 'companion-chat')
      if (!desktop) return
      await publish()
      if (visible) await desktop.show(); else {
        setDesktopModeOverride(undefined)
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
        if (store.data.companion.desktop.visible) { setDesktopModeOverride(undefined); store.setCompanionDesktop(false) }
        else { setDesktopModeOverride('interactive'); store.setCompanionDesktop(true) }
      })
    }).then(() => {
      if (!disposed) report('全局快捷键已启用。')
    }).catch((error) => {
      if (!disposed) report(error instanceof Error ? `快捷键注册失败：${error.message}` : '快捷键注册失败，可能已被其他程序占用。')
    })
    return () => { disposed = true; void unregister(shortcut).catch(() => undefined) }
  }, [data.companion.desktop.toggleShortcut])
  useEffect(() => {
    if (!isTauri()) return
    const shortcut = data.companion.desktop.quietShortcut
    const visibilityShortcut = data.companion.desktop.toggleShortcut
    const report = (message: string) => {
      window.localStorage.setItem('yiyu:companion-quiet-shortcut-status', message)
      window.dispatchEvent(new CustomEvent('yiyu:companion-quiet-shortcut-status', { detail: message }))
    }
    if (!shortcut) {
      window.localStorage.removeItem('yiyu:companion-quiet-shortcut-status')
      return
    }
    if (shortcut === visibilityShortcut) {
      report('与显示 / 隐藏快捷键冲突，请更换组合。')
      return
    }
    let disposed = false
    void unregister(shortcut).catch(() => undefined).then(() => {
      if (disposed) return
      return register(shortcut, (event) => {
        if (event.state !== 'Pressed') return
        const store = useLibraryStore.getState()
        const currentMode = snapshotRef.current.desktopMode
        if (store.data.companion.desktop.visible && currentMode === 'quiet') {
          setDesktopModeOverride(quietShortcutRestoreMode.current)
        } else {
          if (currentMode !== 'quiet') quietShortcutRestoreMode.current = currentMode
          setDesktopModeOverride('quiet')
          chatVisible.current = false
          void getAllWindows().then((items) => items.find((item) => item.label === 'companion-chat')?.hide())
        }
        if (!store.data.companion.desktop.visible) store.setCompanionDesktop(true)
      })
    }).then(() => {
      if (!disposed) report('全局快捷键已启用；再次按下会恢复原显示方式。')
    }).catch((error) => {
      if (!disposed) report(error instanceof Error ? `快捷键注册失败：${error.message}` : '快捷键注册失败，可能已被其他程序占用。')
    })
    return () => { disposed = true; void unregister(shortcut).catch(() => undefined) }
  }, [data.companion.desktop.quietShortcut, data.companion.desktop.toggleShortcut])
  useEffect(() => {
    if (!isTauri() || !data.companion.computer.enabled) return
    const shortcut = data.companion.computer.emergencyShortcut
    if (!shortcut) return
    if ([data.companion.desktop.toggleShortcut, data.companion.desktop.quietShortcut].includes(shortcut)) {
      window.localStorage.setItem('yiyu:computer-shortcut-status', '紧急停止快捷键与伙伴快捷键冲突。')
      return
    }
    let disposed = false
    void unregister(shortcut).catch(() => undefined).then(() => {
      if (disposed) return
      return register(shortcut, (event) => {
        if (event.state !== 'Pressed') return
        const current = useLibraryStore.getState().data.companion.computer
        void createComputerService(current).stopAll().then(() => {
          window.localStorage.setItem('yiyu:computer-shortcut-status', '已执行紧急停止。')
        })
      })
    }).then(() => {
      if (!disposed) window.localStorage.setItem('yiyu:computer-shortcut-status', '紧急停止快捷键已启用。')
    }).catch((error) => {
      if (!disposed) window.localStorage.setItem('yiyu:computer-shortcut-status', error instanceof Error ? error.message : '紧急停止快捷键注册失败。')
    })
    return () => { disposed = true; void unregister(shortcut).catch(() => undefined) }
  }, [data.companion.computer.enabled, data.companion.computer.emergencyShortcut, data.companion.desktop.quietShortcut, data.companion.desktop.toggleShortcut])
  useEffect(() => {
    const trackId = data.session.currentTrackId
    if (!trackId || !playback.playing || learnedTrack.current === trackId || !data.companion.growth.enabled || !data.companion.permissions.musicContext) return
    learnedTrack.current = trackId
    setCompanionPersonality({ curiosity: data.companion.personality.curiosity + 1 }, '已授权的音乐偏好互动')
  }, [data.session.currentTrackId, playback.playing, data.companion.growth.enabled, data.companion.permissions.musicContext, data.companion.personality.curiosity, setCompanionPersonality])
  return null
}
