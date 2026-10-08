import type { RefObject } from 'react'

/** Only a transient playing flag and marker geometry; no song identity or history. */
export interface ListeningInput {
  playing: RefObject<boolean>
  marker: RefObject<HTMLElement | null>
}
export function createListeningNotice() {
  let warmup: number | undefined, started: number | undefined, last = -Infinity
  return (now: number, playing: boolean, blocked: boolean) => {
    if (!playing || blocked) { warmup = undefined; started = undefined; return 0 }
    warmup ??= now
    if (started === undefined && now - warmup >= 45_000 && now - last >= 120_000) { started = now; last = now }
    if (started === undefined) return 0
    const elapsed = now - started
    if (elapsed > 1400) { started = undefined; warmup = now; return 0 }
    // Smooth turn and return, never a beat/tempo or emotion inference.
    return Math.min(1, elapsed / 350, (1400 - elapsed) / 400)
  }
}
