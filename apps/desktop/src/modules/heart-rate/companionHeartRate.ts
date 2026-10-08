import type { RefObject } from 'react'

export interface HeartRateSample { bpm: number; at: number }
/** Only ephemeral readings and the local marker element. No device identity or history. */
export interface CompanionHeartRateInput {
  sample: RefObject<HeartRateSample | null>
  marker: RefObject<HTMLSpanElement | null>
}

export function createHeartPulseRate() {
  let previous: number | undefined, rate = 1
  return (now: number, bpm: number | null) => {
    const delta = previous === undefined ? 0 : Math.max(0, Math.min(2000, now - previous))
    previous = now
    if (bpm === null) { rate = 1; return rate }
    // Decorative, approximate tempo with a comfort cap, never individual beat timing.
    const target = Math.max(.67, Math.min(1.8, bpm / 60))
    rate += (target - rate) * (1 - Math.exp(-delta / 2200))
    return rate
  }
}
