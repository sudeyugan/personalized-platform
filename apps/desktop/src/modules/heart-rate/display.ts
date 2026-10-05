export interface HeartRateStatus {
  phase: 'off' | 'idle' | 'scanning' | 'connecting' | 'connected' | 'error'
  bpm: number | null
  ageMs: number | null
  deviceName: string | null
  devices: { id: string; name: string }[]
  message: string
}
export const emptyHeartRate: HeartRateStatus = { phase: 'off', bpm: null, ageMs: null, deviceName: null, devices: [], message: '心率连接已关闭' }
export interface HeartRateDisplay { enabled: boolean; phase: HeartRateStatus['phase']; bpm: number | null; ageMs: number | null }

export function visibleHeartRate(value: HeartRateDisplay, elapsed = 0) {
  return value.enabled && value.phase === 'connected' && value.ageMs !== null && Number.isFinite(value.ageMs) && value.ageMs >= 0 && Number.isFinite(elapsed) && elapsed >= 0 && value.ageMs + elapsed <= 10_000 && Number.isInteger(value.bpm) && value.bpm! > 0 ? value.bpm : null
}
