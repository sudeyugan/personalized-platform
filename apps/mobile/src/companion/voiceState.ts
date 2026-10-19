import { useSyncExternalStore } from 'react'
import type { VoicePhase } from './figurine'
export interface VoiceState {
  phase: VoicePhase
  session: string
  note: string
  transcript?: string
}
let snapshot: VoiceState = { phase: 'idle', session: '', note: '' }
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function useVoice() {
  return useSyncExternalStore(subscribe, () => snapshot)
}
export const currentVoice = () => snapshot
export function updateVoice(value: VoiceState) {
  snapshot = { phase: value.phase, session: value.session, note: value.note || '' }
  listeners.forEach((listener) => listener())
}
export const voiceActive = (phase: VoicePhase) =>
  ['listening', 'thinking', 'speaking'].includes(phase)
