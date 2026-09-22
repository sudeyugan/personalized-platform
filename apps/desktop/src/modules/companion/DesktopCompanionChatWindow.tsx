import { emitTo, listen } from '@tauri-apps/api/event'
import { CommitStrategy, RealtimeConnection, RealtimeEvents, Scribe } from '@elevenlabs/client'
import { CircleStop, MessageSquarePlus, Mic, Pause, Play, Send, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { emptyCompanionDesktopSnapshot, type CompanionDesktopSnapshot } from './companionDesktop'
import { CompanionRichText } from './CompanionRichText'
import type { AgentPermissionRequest } from './agent/types'
import { AgentPermissionCard } from './AgentPermissionCard'
import type { CompanionMessage } from '../../domain/models'
import type { PrivacyReviewRequest } from '../privacy'
import { PrivacyReviewCard } from './PrivacyReviewCard'

export function DesktopCompanionChatWindow() {
  const [snapshot, setSnapshot] = useState(emptyCompanionDesktopSnapshot)
  const [draft, setDraft] = useState('')
  const [recording, setRecording] = useState(false)
  const [streamedReply, setStreamedReply] = useState('')
  const [permissionRequest, setPermissionRequest] = useState<{ requestId: string; request: AgentPermissionRequest }>()
  const [privacyReview, setPrivacyReview] = useState<{ requestId: string; request: PrivacyReviewRequest }>()
  const [speechActive, setSpeechActive] = useState(false)
  const [speechPaused, setSpeechPaused] = useState(false)
  const [speechNote, setSpeechNote] = useState('')
  const [sendPending, setSendPending] = useState(false)
  const [transientMessages, setTransientMessages] = useState<CompanionMessage[]>([])
  const voiceDraft = useRef(false)
  const pendingSend = useRef<{ requestId: string; message: string } | undefined>(undefined)
  const sendAckTimer = useRef<number | undefined>(undefined)
  const recorder = useRef<MediaRecorder | undefined>(undefined)
  const recordingStream = useRef<MediaStream | undefined>(undefined)
  const realtimeConnection = useRef<RealtimeConnection | undefined>(undefined)
  const wakeConnection = useRef<RealtimeConnection | undefined>(undefined)
  const wakeCommitTimer = useRef<number | undefined>(undefined)
  const wakeArmedTimer = useRef<number | undefined>(undefined)
  const wakeArmed = useRef(false)
  const agentBusy = useRef(false)
  const speechBusy = useRef(false)
  const tokenRequests = useRef(new Map<string, { resolve: (token: string) => void; reject: (error: Error) => void }>())

  useEffect(() => { agentBusy.current = Boolean(snapshot.agentStatus) }, [snapshot.agentStatus])
  useEffect(() => { speechBusy.current = speechActive }, [speechActive])

  useEffect(() => {
    let stopSnapshot: (() => void) | undefined
    let stopOpen: (() => void) | undefined
    let stopTranscript: (() => void) | undefined
    let stopVoiceError: (() => void) | undefined
    let stopStream: (() => void) | undefined
    let stopToken: (() => void) | undefined
    let stopPermission: (() => void) | undefined
    let stopPrivacy: (() => void) | undefined
    let stopSpeechState: (() => void) | undefined
    let stopSpeechNote: (() => void) | undefined
    let stopSendAccepted: (() => void) | undefined
    let stopTransientMessage: (() => void) | undefined
    let stopTransientClear: (() => void) | undefined
    void listen<CompanionDesktopSnapshot>('companion:snapshot', (event) => setSnapshot(event.payload)).then((value) => { stopSnapshot = value; void emitTo('main', 'companion:ready') })
    void listen<{ draft?: string }>('companion:open-chat', (event) => setDraft(event.payload.draft ?? '')).then((value) => { stopOpen = value })
    void listen<{ text: string }>('companion:voice-transcript', (event) => { voiceDraft.current = true; setDraft((value) => [value.trim(), event.payload.text.trim()].filter(Boolean).join(' ')) }).then((value) => { stopTranscript = value })
    void listen<{ message: string }>('companion:voice-error', (event) => setDraft((value) => value || `语音暂不可用：${event.payload.message.replace(/^[A-Z_]+:/, '')}`)).then((value) => { stopVoiceError = value })
    void listen<{ text: string; append?: boolean }>('companion:stream-text', (event) => setStreamedReply((value) => event.payload.append ? value + event.payload.text : event.payload.text)).then((value) => { stopStream = value })
    void listen<{ requestId: string; token?: string; error?: string }>('companion:voice-token-response', (event) => {
      const pending = tokenRequests.current.get(event.payload.requestId)
      if (!pending) return
      tokenRequests.current.delete(event.payload.requestId)
      if (event.payload.token) pending.resolve(event.payload.token)
      else pending.reject(new Error(event.payload.error || 'VOICE_TOKEN_FAILED:无法建立实时转写'))
    }).then((value) => { stopToken = value })
    void listen<{ requestId: string; request: AgentPermissionRequest }>('companion:permission-request', (event) => setPermissionRequest(event.payload)).then((value) => { stopPermission = value })
    void listen<{ requestId: string; request: PrivacyReviewRequest }>('companion:privacy-review-request', (event) => setPrivacyReview(event.payload)).then((value) => { stopPrivacy = value })
    void listen<{ active: boolean; paused?: boolean }>('companion:speech-state', (event) => { setSpeechActive(event.payload.active); setSpeechPaused(Boolean(event.payload.paused)) }).then((value) => { stopSpeechState = value })
    void listen<{ message: string }>('companion:speech-note', (event) => setSpeechNote(event.payload.message)).then((value) => { stopSpeechNote = value })
    void listen<{ requestId: string }>('companion:chat-send-accepted', (event) => {
      const pending = pendingSend.current
      if (!pending || pending.requestId !== event.payload.requestId) return
      pendingSend.current = undefined
      window.clearTimeout(sendAckTimer.current)
      setSendPending(false)
      setSpeechNote('')
      setDraft((value) => value.trim() === pending.message ? '' : value)
    }).then((value) => { stopSendAccepted = value })
    void listen<{ role: CompanionMessage['role']; content: string }>('companion:transient-message', (event) => {
      setTransientMessages((messages) => [...messages, { id: `transient-${crypto.randomUUID()}`, role: event.payload.role, content: event.payload.content, createdAt: new Date().toISOString() }])
    }).then((value) => { stopTransientMessage = value })
    void listen('companion:transient-clear', () => setTransientMessages([])).then((value) => { stopTransientClear = value })
    return () => {
      stopSnapshot?.()
      stopOpen?.()
      stopTranscript?.()
      stopVoiceError?.()
      stopStream?.()
      stopToken?.()
      stopPermission?.()
      stopPrivacy?.()
      stopSpeechState?.()
      stopSpeechNote?.()
      stopSendAccepted?.()
      stopTransientMessage?.()
      stopTransientClear?.()
      realtimeConnection.current?.close()
      wakeConnection.current?.close()
      window.clearTimeout(wakeCommitTimer.current)
      window.clearTimeout(wakeArmedTimer.current)
      window.clearTimeout(sendAckTimer.current)
      tokenRequests.current.forEach((pending) => pending.reject(new Error('VOICE_CANCELLED:语音窗口已关闭')))
      tokenRequests.current.clear()
      recordingStream.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  useEffect(() => {
    if (!snapshot.voice.wakeEnabled || snapshot.voice.sttProviderId !== 'elevenlabs') {
      wakeConnection.current?.close()
      wakeConnection.current = undefined
      wakeArmed.current = false
      window.clearTimeout(wakeCommitTimer.current)
      window.clearTimeout(wakeArmedTimer.current)
      return
    }
    let disposed = false
    let reconnectTimer: number | undefined

    const requestToken = () => {
      const requestId = crypto.randomUUID()
      return new Promise<string>((resolve, reject) => {
        tokenRequests.current.set(requestId, { resolve, reject })
        void emitTo('main', 'companion:voice-token-request', { requestId })
        window.setTimeout(() => {
          const pending = tokenRequests.current.get(requestId)
          if (!pending) return
          tokenRequests.current.delete(requestId)
          pending.reject(new Error('VOICE_TOKEN_TIMEOUT:语音唤醒连接超时'))
        }, 20_000)
      })
    }
    const disarmLater = () => {
      window.clearTimeout(wakeArmedTimer.current)
      wakeArmedTimer.current = window.setTimeout(() => {
        wakeArmed.current = false
        setSpeechNote('说“小鱼”即可再次唤醒。')
      }, 45_000)
    }
    const handleUtterance = (value: string) => {
      if (agentBusy.current || speechBusy.current) return
      const text = value.trim()
      if (!text) return
      const match = /小\s*[鱼魚]/.exec(text)
      if (match) {
        const question = text.slice((match.index ?? 0) + match[0].length).replace(/^[，。！？,.!?：:]+/, '').trim()
        void emitTo('main', 'companion:chat-open-request', {})
        if (!question) {
          wakeArmed.current = true
          setSpeechNote('小鱼在听，接下来可以连续交谈。')
          disarmLater()
          return
        }
        wakeArmed.current = true
        disarmLater()
        setSpeechNote('已进入语音聊天，回答后可以继续说。')
        void emitTo('main', 'companion:chat-send', { message: question, inputMode: 'voice', wake: true })
        return
      }
      if (!wakeArmed.current) return
      disarmLater()
      setSpeechNote('语音聊天中，回答后可以继续说。')
      void emitTo('main', 'companion:chat-open-request', {})
      void emitTo('main', 'companion:chat-send', { message: text, inputMode: 'voice', wake: true })
    }
    const connect = async () => {
      try {
        const token = await requestToken()
        if (disposed) return
        let partial = ''
        const connection = Scribe.connect({
          token,
          modelId: 'scribe_v2_realtime',
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
          window.clearTimeout(wakeCommitTimer.current)
          wakeCommitTimer.current = window.setTimeout(() => { if (partial.trim()) connection.commit() }, 900)
        })
        connection.on(RealtimeEvents.COMMITTED_TRANSCRIPT, (event) => { partial = ''; handleUtterance(event.text) })
        connection.on(RealtimeEvents.ERROR, (event) => setSpeechNote(`语音唤醒暂不可用：${event.error || '实时转写失败'}`))
        connection.on(RealtimeEvents.CLOSE, () => {
          if (wakeConnection.current === connection) wakeConnection.current = undefined
          if (!disposed) reconnectTimer = window.setTimeout(() => void connect(), 2500)
        })
        wakeConnection.current = connection
        setSpeechNote('语音唤醒已开启，说“小鱼”开始交谈。')
      } catch (error) {
        if (disposed) return
        setSpeechNote(`语音唤醒暂不可用：${error instanceof Error ? error.message.replace(/^[A-Z_]+:/, '') : '请检查语音服务'}`)
        reconnectTimer = window.setTimeout(() => void connect(), 5000)
      }
    }
    void connect()
    return () => {
      disposed = true
      window.clearTimeout(reconnectTimer)
      window.clearTimeout(wakeCommitTimer.current)
      window.clearTimeout(wakeArmedTimer.current)
      wakeConnection.current?.close()
      wakeConnection.current = undefined
      wakeArmed.current = false
    }
  }, [snapshot.voice.sttProviderId, snapshot.voice.wakeEnabled])

  const send = () => {
    const message = draft.trim()
    if (!message || sendPending) return
    const requestId = crypto.randomUUID()
    pendingSend.current = { requestId, message }
    setSendPending(true)
    setSpeechNote('正在交给伙伴…')
    setStreamedReply('')
    setPermissionRequest(undefined)
    void emitTo('main', 'companion:chat-send', { requestId, message, inputMode: voiceDraft.current ? 'voice' : 'text', replace: true }).then(() => {
      if (pendingSend.current?.requestId !== requestId) return
      sendAckTimer.current = window.setTimeout(() => {
        if (pendingSend.current?.requestId !== requestId) return
        pendingSend.current = undefined
        setSendPending(false)
        setSpeechNote('主窗口没有接收到消息，请重新打开一隅后再试。')
      }, 2500)
    }).catch((error) => {
      if (pendingSend.current?.requestId !== requestId) return
      pendingSend.current = undefined
      setSendPending(false)
      setSpeechNote(`消息发送失败：${error instanceof Error ? error.message : String(error)}`)
    })
    voiceDraft.current = false
  }

  const stopTurn = () => {
    setStreamedReply('')
    setPermissionRequest(undefined)
    setSnapshot((value) => ({ ...value, agentStatus: undefined }))
    void emitTo('main', 'companion:turn-stop')
  }

  const toggleRecording = async () => {
    if (recording) {
      if (realtimeConnection.current) {
        realtimeConnection.current.commit()
        setRecording(false)
        window.setTimeout(() => { realtimeConnection.current?.close(); realtimeConnection.current = undefined }, 700)
        return
      }
      recorder.current?.stop()
      return
    }
    try {
      if (snapshot.voice.sttProviderId === 'elevenlabs') {
        const requestId = crypto.randomUUID()
        const token = await new Promise<string>((resolve, reject) => {
          tokenRequests.current.set(requestId, { resolve, reject })
          void emitTo('main', 'companion:voice-token-request', { requestId })
          window.setTimeout(() => {
            const pending = tokenRequests.current.get(requestId)
            if (!pending) return
            tokenRequests.current.delete(requestId)
            pending.reject(new Error('VOICE_TOKEN_TIMEOUT:实时转写连接超时'))
          }, 20_000)
        })
        const prefix = draft.trim()
        let committed = ''
        const updateDraft = (partial = '') => { voiceDraft.current = true; setDraft([prefix, committed, partial].filter(Boolean).join(' ')) }
        const connection = Scribe.connect({
          token,
          modelId: 'scribe_v2_realtime',
          commitStrategy: CommitStrategy.MANUAL,
          microphone: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            workletPaths: { scribeAudioProcessor: '/vendor/elevenlabs/scribe-audio-processor.js' },
          },
        })
        connection.on(RealtimeEvents.PARTIAL_TRANSCRIPT, (event) => updateDraft(event.text))
        connection.on(RealtimeEvents.COMMITTED_TRANSCRIPT, (event) => { committed = [committed, event.text.trim()].filter(Boolean).join(' '); updateDraft() })
        connection.on(RealtimeEvents.ERROR, (event) => {
          setRecording(false)
          setDraft((value) => value || `语音暂不可用：${event.error || '实时转写失败'}`)
        })
        connection.on(RealtimeEvents.CLOSE, () => { setRecording(false); realtimeConnection.current = undefined })
        realtimeConnection.current = connection
        setRecording(true)
        return
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find((type) => MediaRecorder.isTypeSupported(type))
      const chunks: Blob[] = []
      const nextRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      recorder.current = nextRecorder
      recordingStream.current = stream
      nextRecorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
      nextRecorder.onstop = () => {
        setRecording(false)
        stream.getTracks().forEach((track) => track.stop())
        const audio = new Blob(chunks, { type: nextRecorder.mimeType || 'audio/webm' })
        if (audio.size) void audio.arrayBuffer().then((buffer) => emitTo('main', 'companion:voice-transcribe', { audio: [...new Uint8Array(buffer)], mimeType: audio.type }))
      }
      nextRecorder.start()
      setRecording(true)
      window.setTimeout(() => { if (nextRecorder.state === 'recording') nextRecorder.stop() }, 60_000)
    } catch (error) {
      setDraft((value) => value || `无法使用麦克风：${error instanceof Error ? error.message : '请检查系统权限'}`)
    }
  }

  return <main className="desktop-companion-chat">
    <section className="desktop-chat-card">
      <header><span className="desktop-chat-identity"><strong>{snapshot.name}</strong><small>{snapshot.actionLabel}</small></span><span className="desktop-chat-header-actions">{snapshot.agentStatus && <button className="turn-stop" title="中止当前回答" aria-label="中止当前回答" onClick={stopTurn}><CircleStop size={13} /></button>}{speechActive && <><button title={speechPaused ? '继续朗读' : '暂停朗读'} aria-label={speechPaused ? '继续朗读' : '暂停朗读'} onClick={() => void emitTo('main', 'companion:speech-pause', { paused: !speechPaused })}>{speechPaused ? <Play size={13} /> : <Pause size={13} />}</button><button title="停止朗读" aria-label="停止朗读" onClick={() => void emitTo('main', 'companion:speech-stop')}><VolumeX size={13} /></button></>}<button disabled={Boolean(snapshot.agentStatus)} title="新对话" aria-label="新对话" onClick={() => { setDraft(''); setTransientMessages([]); void emitTo('main', 'companion:new-chat') }}><MessageSquarePlus size={13} /></button></span></header>
      <div className="desktop-chat-messages">{[...snapshot.messages, ...transientMessages].map((message) => <div className={`desktop-chat-message ${message.role}`} key={message.id}><CompanionRichText text={message.content} /></div>)}{streamedReply && <div className="desktop-chat-message companion streaming"><CompanionRichText text={`${streamedReply}▋`} /></div>}{!snapshot.messages.length && !transientMessages.length && !streamedReply && <p className="empty">想说什么都可以。</p>}{speechNote && <small className="desktop-speech-note">{speechNote}</small>}</div>
      {permissionRequest && <AgentPermissionCard request={permissionRequest.request} onDecision={(allowed) => { void emitTo('main', 'companion:permission-response', { requestId: permissionRequest.requestId, allowed }); setPermissionRequest(undefined) }} />}
      {privacyReview && <PrivacyReviewCard request={privacyReview.request} onDecision={(allowed) => { void emitTo('main', 'companion:privacy-review-response', { requestId: privacyReview.requestId, allowed }); setPrivacyReview(undefined) }} />}
      <div className="desktop-chat-compose"><button className={recording ? 'recording' : ''} disabled={!snapshot.voice.sttEnabled || snapshot.voice.wakeEnabled || Boolean(snapshot.agentStatus)} title={snapshot.voice.wakeEnabled ? '语音唤醒已接管麦克风，请说“小鱼”' : snapshot.voice.sttEnabled ? recording ? '停止录音并转写' : '按一下开始录音' : '请先在 AI 伙伴设置中配置语音服务'} onClick={() => void toggleRecording()}><Mic size={14} /></button><textarea rows={2} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send() } }} placeholder="说点什么…" /><button disabled={!draft.trim() || sendPending} title={sendPending ? '正在发送' : snapshot.agentStatus ? '中止当前回答并发送这条消息' : '发送'} onClick={send}><Send size={14} /></button></div>
    </section>
  </main>
}
