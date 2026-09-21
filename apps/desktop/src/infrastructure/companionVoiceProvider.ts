import { invoke } from '@tauri-apps/api/core'
import type { CompanionData } from '../domain/models'

const voiceSecretId = 'companion-voice-elevenlabs'
const isTauriRuntime = () => '__TAURI_INTERNALS__' in window

export interface SpeechToTextProvider {
  readonly id: string
  transcribe(audio: Blob): Promise<string>
}

export interface TextToSpeechProvider {
  readonly id: string
  synthesize(text: string): Promise<Blob>
}

class UnconfiguredSpeechToText implements SpeechToTextProvider {
  readonly id = 'none'
  transcribe(_audio: Blob): Promise<string> {
    return Promise.reject(new Error('VOICE_STT_UNCONFIGURED:请先在 AI 伙伴设置中选择语音服务'))
  }
}

class UnconfiguredTextToSpeech implements TextToSpeechProvider {
  readonly id = 'none'
  synthesize(_text: string): Promise<Blob> {
    return Promise.reject(new Error('VOICE_TTS_UNCONFIGURED:请先在 AI 伙伴设置中选择语音服务'))
  }
}

class UnsupportedSpeechToText implements SpeechToTextProvider {
  readonly id: string
  constructor(id: string) { this.id = id }
  transcribe(_audio: Blob): Promise<string> {
    return Promise.reject(new Error('VOICE_STT_PROVIDER_UNSUPPORTED:该语音识别 Provider 尚未接入'))
  }
}

class UnsupportedTextToSpeech implements TextToSpeechProvider {
  readonly id: string
  constructor(id: string) { this.id = id }
  synthesize(_text: string): Promise<Blob> {
    return Promise.reject(new Error('VOICE_TTS_PROVIDER_UNSUPPORTED:该语音合成 Provider 尚未接入'))
  }
}

class ElevenLabsSpeechToText implements SpeechToTextProvider {
  readonly id = 'elevenlabs'
  private readonly model: string
  constructor(model: string) { this.model = model }
  async transcribe(audio: Blob) {
    if (!isTauriRuntime()) throw new Error('VOICE_DESKTOP_REQUIRED:语音识别只在桌面应用中可用')
    const bytes = [...new Uint8Array(await audio.arrayBuffer())]
    return invoke<string>('elevenlabs_speech_to_text', { audio: bytes, mimeType: audio.type || 'audio/webm', model: this.model })
  }
}

class ElevenLabsTextToSpeech implements TextToSpeechProvider {
  readonly id = 'elevenlabs'
  private readonly model: string
  private readonly voice: string
  constructor(model: string, voice: string) { this.model = model; this.voice = voice }
  async synthesize(text: string) {
    if (!isTauriRuntime()) throw new Error('VOICE_DESKTOP_REQUIRED:语音合成只在桌面应用中可用')
    const bytes = await invoke<number[]>('elevenlabs_text_to_speech', { text, model: this.model, voice: this.voice })
    return new Blob([new Uint8Array(bytes)], { type: 'audio/mpeg' })
  }
}

export function createSpeechToTextProvider(config: CompanionData['voice']['stt']): SpeechToTextProvider {
  if (config.providerId === 'elevenlabs') return new ElevenLabsSpeechToText(config.model || 'scribe_v2')
  return config.providerId === 'none' ? new UnconfiguredSpeechToText() : new UnsupportedSpeechToText(config.providerId)
}

export function createTextToSpeechProvider(config: CompanionData['voice']['tts']): TextToSpeechProvider {
  if (config.providerId === 'elevenlabs') return new ElevenLabsTextToSpeech(config.model || 'eleven_flash_v2_5', config.voice)
  return config.providerId === 'none' ? new UnconfiguredTextToSpeech() : new UnsupportedTextToSpeech(config.providerId)
}

export async function storeCompanionVoiceKey(secret: string) {
  if (!secret.trim()) throw new Error('VOICE_KEY_EMPTY:API Key 不能为空')
  if (isTauriRuntime()) await invoke('store_secret', { id: voiceSecretId, secret })
  else sessionStorage.setItem('yiyu.companion.voice.key', secret)
}

export async function hasCompanionVoiceKey() {
  return isTauriRuntime()
    ? invoke<boolean>('has_secret', { id: voiceSecretId })
    : Boolean(sessionStorage.getItem('yiyu.companion.voice.key'))
}

export async function deleteCompanionVoiceKey() {
  if (isTauriRuntime()) await invoke('delete_secret', { id: voiceSecretId })
  else sessionStorage.removeItem('yiyu.companion.voice.key')
}
