import { AudioFormat, CommitStrategy, RealtimeEvents, Scribe } from '@elevenlabs/client'
import type { createPostWakeAudio } from './postWakeAudio'

export function openVoiceRecognition(token: string, audio: ReturnType<typeof createPostWakeAudio>, callbacks: {
  active: () => boolean
  ready: () => void
  partial: (text: string) => void
  committed: (text: string) => void
  error: (message: string) => void
  closed: () => void
}) {
  const connection = Scribe.connect({
    token, modelId: 'scribe_v2_realtime', languageCode: 'zh', secondaryLanguages: ['en'],
    commitStrategy: CommitStrategy.VAD, audioFormat: AudioFormat.PCM_16000, sampleRate: 16_000,
    vadSilenceThresholdSecs: 1.2, vadThreshold: 0.4, minSpeechDurationMs: 200, minSilenceDurationMs: 700,
    filterBackgroundAudio: false, noVerbatim: true,
  })
  connection.on(RealtimeEvents.SESSION_STARTED, () => {
    if (!callbacks.active()) return
    audio.attach((audioBase64) => connection.send({ audioBase64, sampleRate: 16_000 }))
    callbacks.ready()
  })
  connection.on(RealtimeEvents.PARTIAL_TRANSCRIPT, (event) => { if (callbacks.active()) callbacks.partial(event.text) })
  connection.on(RealtimeEvents.COMMITTED_TRANSCRIPT, (event) => { if (callbacks.active()) callbacks.committed(event.text) })
  connection.on(RealtimeEvents.ERROR, (event) => { if (callbacks.active()) callbacks.error(event.error || '实时转写失败') })
  connection.on(RealtimeEvents.CLOSE, () => { if (callbacks.active()) { audio.detach(); callbacks.closed() } })
  return connection
}
