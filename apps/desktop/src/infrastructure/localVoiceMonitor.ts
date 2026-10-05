import type { CompanionData } from '../domain/models'

export interface LocalVoiceDetection { detected: boolean; speakerMatched: boolean; speakerScore?: number }
interface Capture { stop: () => void }
type Config = Pick<CompanionData['voice'], 'wakeWord' | 'wakeSensitivity' | 'speakerVerification'>
type NativeInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>

// Native KWS has one engine. Serialize access and give each microphone a lease:
// stale capture/PCM completions must never stop or notify a newer listener.
export function createLocalVoiceMonitor(invoke: NativeInvoke, openCapture: (samples: (chunk: number[]) => void) => Promise<Capture>) {
  let current: { stop: () => void } | undefined
  let operations: Promise<unknown> = Promise.resolve()
  const enqueue = <T>(operation: () => Promise<T>) => {
    const next = operations.then(operation)
    operations = next.catch(() => undefined)
    return next
  }
  const stop = () => {
    current?.stop()
    return enqueue(async () => { if (!current) await invoke('local_voice_stop') })
  }
  const monitor = async (config: Config, onDetection: (result: LocalVoiceDetection) => void, onError: (error: unknown) => void) => {
    current?.stop()
    let capture: Capture | undefined
    let queued: number[] = []
    let processing = false
    let stopped = false
    const active = () => !stopped && current === lease
    const lease = { isActive: active, stop: () => {
      if (stopped) return
      stopped = true
      queued = []
      capture?.stop()
      if (current !== lease) return
      current = undefined
      void enqueue(async () => { if (!current) await invoke('local_voice_stop') }).catch(() => undefined)
    } }
    current = lease
    const flush = async () => {
      if (!active() || processing || queued.length < 3200) return
      processing = true
      const samples = queued.splice(0, Math.min(queued.length, 6400))
      try {
        const result = await enqueue(async () => active() ? invoke<LocalVoiceDetection>('local_voice_process_pcm', { samples }) : undefined)
        if (active() && result?.detected) onDetection(result)
      } catch (error) {
        if (active() && !String(error).includes('VOICE_SAMPLE_SHORT:')) {
          lease.stop()
          onError(error)
        }
      } finally {
        processing = false
        if (active() && queued.length >= 3200) void flush()
      }
    }
    try {
      await enqueue(async () => {
        if (active()) await invoke('local_voice_start', { wakeWord: config.wakeWord, sensitivity: config.wakeSensitivity, speakerRequired: config.speakerVerification })
      })
      if (!active()) return lease
      capture = await openCapture((samples) => {
        if (!active()) return
        queued.push(...samples)
        if (queued.length > 16_000) queued = queued.slice(-16_000)
        void flush()
      })
      if (!active()) capture.stop()
    } catch (error) {
      const report = active()
      lease.stop()
      if (report) throw error
    }
    return lease
  }
  return { stop, monitor }
}
