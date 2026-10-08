const KEY = 'yiyu:microphone-preferences'
export interface MicrophonePreferences { deviceId: string; gain: number }
export function readMicrophonePreferences(): MicrophonePreferences {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return { deviceId: typeof value?.deviceId === 'string' ? value.deviceId.slice(0, 512) : '', gain: typeof value?.gain === 'number' && Number.isFinite(value.gain) ? Math.max(1, Math.min(3, value.gain)) : 1 }
  } catch { return { deviceId: '', gain: 1 } }
}
export function saveMicrophonePreferences(value: MicrophonePreferences) {
  localStorage.setItem(KEY, JSON.stringify(value))
}
export function microphoneLevel(samples: number[]) {
  return Math.min(1, Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / Math.max(1, samples.length)) * 5)
}
