import { toSpokenText } from './speechText'

export function playAudioBlob(blob: Blob, audioRef: { current: HTMLAudioElement | undefined }) {
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

interface ReplySpeechOptions {
  provider?: { synthesize(text: string): Promise<Blob> }
  limit: number
  sanitize(text: string): string
  isActive(): boolean
  play(blob: Blob, text: string): Promise<void>
  onLimit(): void
}

export function replySpeechLimit(mode: 'summary' | 'full', input: 'text' | 'voice', wake = false) {
  return input === 'voice' || wake || mode === 'full' ? Number.POSITIVE_INFINITY : 220
}

// One reply's synthesis/playback queue; the bridge retains turn and visual ownership.
export function createReplySpeechQueue(options: ReplySpeechOptions) {
  let speechBuffer = ''
  let speechQueue = Promise.resolve()
  let synthesisQueue = Promise.resolve()
  let spokenCharacters = 0
  let speechClosed = false
  let speechNoteSent = false
  const closeLongSpeech = () => {
    if (speechClosed) return
    speechClosed = true
    if (!speechNoteSent) {
      speechNoteSent = true
      options.onLimit()
    }
  }
  const queueSpeech = (text: string) => {
    const spoken = toSpokenText(text)
    if (!options.provider || !spoken || speechClosed || !options.isActive()) return
    if (spokenCharacters > 0 && spokenCharacters + spoken.length > options.limit) { closeLongSpeech(); return }
    spokenCharacters += spoken.length
    const provider = options.provider
    const protectedText = options.sanitize(spoken)
    const synthesis = synthesisQueue.then(() => options.isActive() ? provider.synthesize(protectedText) : undefined)
    synthesisQueue = synthesis.then(() => undefined, () => undefined)
    speechQueue = speechQueue.then(async () => {
      if (!options.isActive()) return
      const blob = await synthesis
      if (!blob || !options.isActive()) return
      await options.play(blob, spoken)
    })
  }
  return {
    speak(text: string) {
      speechBuffer = text
      let match = speechBuffer.match(/^([\s\S]*?)([。！？!?；;]|\n\n)/)
      while (match) {
        queueSpeech(`${match[1]}${match[2]}`)
        speechBuffer = speechBuffer.slice(match[0].length)
        if (match[2] === '\n\n' && Number.isFinite(options.limit)) closeLongSpeech()
        match = speechBuffer.match(/^([\s\S]*?)([。！？!?；;]|\n\n)/)
      }
      if (speechBuffer.trim()) { queueSpeech(speechBuffer); speechBuffer = '' }
      return speechQueue
    },
  }
}
