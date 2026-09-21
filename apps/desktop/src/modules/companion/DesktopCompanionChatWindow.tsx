import { emitTo, listen } from '@tauri-apps/api/event'
import { CommitStrategy, RealtimeConnection, RealtimeEvents, Scribe } from '@elevenlabs/client'
import { CircleStop, MessageSquarePlus, Mic, Pause, Play, Send, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { emptyCompanionDesktopSnapshot, type CompanionDesktopSnapshot } from './companionDesktop'
import { CompanionRichText } from './CompanionRichText'
import { describeAgentPermission } from './agent/permissionCopy'
import type { AgentPermissionRequest } from './agent/types'

export function DesktopCompanionChatWindow() {
  const [snapshot, setSnapshot] = useState(emptyCompanionDesktopSnapshot)
  const [draft, setDraft] = useState('')
  const [recording, setRecording] = useState(false)
  const [streamedReply, setStreamedReply] = useState('')
  const [permissionRequest, setPermissionRequest] = useState<{ requestId: string; request: AgentPermissionRequest }>()
  const [speechActive, setSpeechActive] = useState(false)
  const [speechPaused, setSpeechPaused] = useState(false)
  const [speechNote, setSpeechNote] = useState('')
  const voiceDraft = useRef(false)
  const recorder = useRef<MediaRecorder | undefined>(undefined)
  const recordingStream = useRef<MediaStream | undefined>(undefined)
  const realtimeConnection = useRef<RealtimeConnection | undefined>(undefined)
  const tokenRequests = useRef(new Map<string, { resolve: (token: string) => void; reject: (error: Error) => void }>())

  useEffect(() => {
    let stopSnapshot: (() => void) | undefined
    let stopOpen: (() => void) | undefined
    let stopTranscript: (() => void) | undefined
    let stopVoiceError: (() => void) | undefined
    let stopStream: (() => void) | undefined
    let stopToken: (() => void) | undefined
    let stopPermission: (() => void) | undefined
    let stopSpeechState: (() => void) | undefined
    let stopSpeechNote: (() => void) | undefined
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
    void listen<{ active: boolean; paused?: boolean }>('companion:speech-state', (event) => { setSpeechActive(event.payload.active); setSpeechPaused(Boolean(event.payload.paused)) }).then((value) => { stopSpeechState = value })
    void listen<{ message: string }>('companion:speech-note', (event) => setSpeechNote(event.payload.message)).then((value) => { stopSpeechNote = value })
    return () => {
      stopSnapshot?.()
      stopOpen?.()
      stopTranscript?.()
      stopVoiceError?.()
      stopStream?.()
      stopToken?.()
      stopPermission?.()
      stopSpeechState?.()
      stopSpeechNote?.()
      realtimeConnection.current?.close()
      tokenRequests.current.forEach((pending) => pending.reject(new Error('VOICE_CANCELLED:语音窗口已关闭')))
      tokenRequests.current.clear()
      recordingStream.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  const send = () => {
    const message = draft.trim()
    if (!message || snapshot.agentStatus) return
    setDraft('')
    setSpeechNote('')
    void emitTo('main', 'companion:chat-send', { message, inputMode: voiceDraft.current ? 'voice' : 'text' })
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
      <header><span className="desktop-chat-identity"><strong>{snapshot.name}</strong><small>{snapshot.actionLabel}</small></span><span className="desktop-chat-header-actions">{snapshot.agentStatus && <button className="turn-stop" title="中止当前回答" aria-label="中止当前回答" onClick={stopTurn}><CircleStop size={13} /></button>}{speechActive && <><button title={speechPaused ? '继续朗读' : '暂停朗读'} aria-label={speechPaused ? '继续朗读' : '暂停朗读'} onClick={() => void emitTo('main', 'companion:speech-pause', { paused: !speechPaused })}>{speechPaused ? <Play size={13} /> : <Pause size={13} />}</button><button title="停止朗读" aria-label="停止朗读" onClick={() => void emitTo('main', 'companion:speech-stop')}><VolumeX size={13} /></button></>}<button disabled={Boolean(snapshot.agentStatus)} title="新对话" aria-label="新对话" onClick={() => { setDraft(''); void emitTo('main', 'companion:new-chat') }}><MessageSquarePlus size={13} /></button></span></header>
      <div className="desktop-chat-messages">{snapshot.messages.map((message) => <div className={`desktop-chat-message ${message.role}`} key={message.id}><CompanionRichText text={message.content} /></div>)}{streamedReply && <div className="desktop-chat-message companion streaming"><CompanionRichText text={`${streamedReply}▋`} /></div>}{!snapshot.messages.length && !streamedReply && <p className="empty">想说什么都可以。</p>}{speechNote && <small className="desktop-speech-note">{speechNote}</small>}</div>
      {permissionRequest && (() => { const copy = describeAgentPermission(permissionRequest.request); return <div className="desktop-permission-card"><strong>{copy.title}</strong><span>{copy.subject}</span><small>{copy.detail}</small><div><button onClick={() => { void emitTo('main', 'companion:permission-response', { requestId: permissionRequest.requestId, allowed: false }); setPermissionRequest(undefined) }}>取消</button><button onClick={() => { void emitTo('main', 'companion:permission-response', { requestId: permissionRequest.requestId, allowed: true }); setPermissionRequest(undefined) }}>确认</button></div></div> })()}
      <div className="desktop-chat-compose"><button className={recording ? 'recording' : ''} disabled={!snapshot.voice.sttEnabled || Boolean(snapshot.agentStatus)} title={snapshot.voice.sttEnabled ? recording ? '停止录音并转写' : '按一下开始录音' : '请先在 AI 伙伴设置中配置语音服务'} onClick={() => void toggleRecording()}><Mic size={14} /></button><textarea rows={2} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send() } }} placeholder="说点什么…" /><button disabled={!draft.trim() || Boolean(snapshot.agentStatus)} onClick={send}><Send size={14} /></button></div>
    </section>
  </main>
}
