import { Channel, invoke } from '@tauri-apps/api/core'
import type { CompanionData } from '../domain/models'

export interface LocalVoiceStatus {
  modelsInstalled: boolean
  speakerEnrolled: boolean
  modelBytes: number
}

export interface LocalVoiceDownloadProgress {
  phase: 'connecting' | 'downloading' | 'verifying' | 'retrying' | 'switching' | 'complete'
  label: string
  source: string
  fileIndex: number
  fileCount: number
  downloadedBytes: number
  totalBytes?: number
  percent?: number
}

export type LocalVoiceModelSource = 'china' | 'auto' | 'global'

export interface LocalVoiceInstallSnapshot {
  active: boolean
  cancelling: boolean
  progress?: LocalVoiceDownloadProgress
  error?: string
}

let activeInstall: Promise<LocalVoiceStatus> | undefined
let installSnapshot: LocalVoiceInstallSnapshot = { active: false, cancelling: false }
const installListeners = new Set<(snapshot: LocalVoiceInstallSnapshot) => void>()

function publishInstallSnapshot(snapshot: LocalVoiceInstallSnapshot) {
  installSnapshot = snapshot
  installListeners.forEach((listener) => listener(snapshot))
}

interface LocalVoiceDetection {
  detected: boolean
  speakerMatched: boolean
  speakerScore?: number
}

interface PcmCapture {
  stop: () => void
}

function resample(input: Float32Array, inputRate: number, outputRate = 16_000) {
  if (inputRate === outputRate) return Array.from(input)
  const ratio = inputRate / outputRate
  const length = Math.max(1, Math.floor(input.length / ratio))
  const output = new Array<number>(length)
  for (let index = 0; index < length; index += 1) {
    const position = index * ratio
    const left = Math.floor(position)
    const right = Math.min(input.length - 1, left + 1)
    const fraction = position - left
    output[index] = input[left] * (1 - fraction) + input[right] * fraction
  }
  return output
}

async function openPcmCapture(onSamples: (samples: number[]) => void): Promise<PcmCapture> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false })
  const context = new AudioContext()
  const source = context.createMediaStreamSource(stream)
  const processor = context.createScriptProcessor(4096, 1, 1)
  const silent = context.createGain()
  silent.gain.value = 0
  processor.onaudioprocess = (event) => {
    onSamples(resample(event.inputBuffer.getChannelData(0), context.sampleRate))
    event.outputBuffer.getChannelData(0).fill(0)
  }
  source.connect(processor)
  processor.connect(silent)
  silent.connect(context.destination)
  await context.resume()
  return {
    stop: () => {
      processor.onaudioprocess = null
      source.disconnect()
      processor.disconnect()
      silent.disconnect()
      stream.getTracks().forEach((track) => track.stop())
      void context.close()
    },
  }
}

export async function captureSpeakerSample(seconds = 3.4) {
  const target = Math.floor(16_000 * seconds)
  const samples: number[] = []
  return new Promise<number[]>((resolve, reject) => {
    let capture: PcmCapture | undefined
    let finished = false
    void openPcmCapture((chunk) => {
      if (finished) return
      samples.push(...chunk)
      if (samples.length < target) return
      finished = true
      capture?.stop()
      resolve(samples.slice(0, target))
    }).then((value) => {
      capture = value
      if (finished) capture.stop()
    }).catch(reject)
  })
}

export const localVoice = {
  status: () => invoke<LocalVoiceStatus>('local_voice_status'),
  subscribeInstall: (listener: (snapshot: LocalVoiceInstallSnapshot) => void) => {
    installListeners.add(listener)
    listener(installSnapshot)
    return () => { installListeners.delete(listener) }
  },
  install: (source: LocalVoiceModelSource) => {
    if (activeInstall) return activeInstall
    const channel = new Channel<LocalVoiceDownloadProgress>()
    channel.onmessage = (progress) => publishInstallSnapshot({ active: true, cancelling: false, progress })
    publishInstallSnapshot({ active: true, cancelling: false })
    activeInstall = invoke<LocalVoiceStatus>('local_voice_install_models', { source, onProgress: channel })
      .then((status) => {
        publishInstallSnapshot({ active: false, cancelling: false, progress: installSnapshot.progress })
        return status
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        publishInstallSnapshot({ active: false, cancelling: false, progress: installSnapshot.progress, error: message })
        throw error
      })
      .finally(() => {
        channel.onmessage = () => undefined
        activeInstall = undefined
      })
    return activeInstall
  },
  cancelInstall: async () => {
    if (!installSnapshot.active) return false
    publishInstallSnapshot({ ...installSnapshot, cancelling: true })
    const accepted = await invoke<boolean>('local_voice_cancel_install')
    if (!accepted) publishInstallSnapshot({ ...installSnapshot, active: false, cancelling: false })
    return accepted
  },
  enroll: (samples: number[][]) => invoke<LocalVoiceStatus>('local_voice_enroll', { samples }),
  deleteProfile: () => invoke<LocalVoiceStatus>('local_voice_delete_profile'),
  stop: () => invoke<void>('local_voice_stop'),
  async monitor(config: Pick<CompanionData['voice'], 'wakeWord' | 'wakeSensitivity' | 'speakerVerification'>, onDetection: (result: LocalVoiceDetection) => void, onError: (error: unknown) => void) {
    await invoke('local_voice_start', { wakeWord: config.wakeWord, sensitivity: config.wakeSensitivity, speakerRequired: config.speakerVerification })
    let queued: number[] = []
    let processing = false
    let stopped = false
    let capture: PcmCapture | undefined
    const flush = async () => {
      if (processing || stopped || queued.length < 3200) return
      processing = true
      const chunk = queued.splice(0, Math.min(queued.length, 6400))
      try {
        const result = await invoke<LocalVoiceDetection>('local_voice_process_pcm', { samples: chunk })
        if (result.detected) onDetection(result)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (message.includes('VOICE_SAMPLE_SHORT:')) return
        stopped = true
        queued = []
        capture?.stop()
        void localVoice.stop().catch(() => undefined)
        onError(error)
      } finally {
        processing = false
        if (queued.length >= 3200) void flush()
      }
    }
    try {
      capture = await openPcmCapture((samples) => {
        queued.push(...samples)
        if (queued.length > 16_000) queued = queued.slice(-16_000)
        void flush()
      })
    } catch (error) {
      await localVoice.stop().catch(() => undefined)
      throw error
    }
    return {
      stop: () => {
        stopped = true
        queued = []
        capture?.stop()
        void localVoice.stop().catch(() => undefined)
      },
    }
  },
}
