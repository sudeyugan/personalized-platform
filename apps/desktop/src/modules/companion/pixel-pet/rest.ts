import type { PetConversationState } from './conversation'
import type { PixelPoint } from './types'

export const PET_REST_DELAY = 90_000
const clamp = (n: number) => Math.max(0, Math.min(1, n))
// Cosmetic rest only; never changes microphone/TTS/task state or stores activity.
export function createPetRest() {
  let previous: number | undefined, lastActivity: number | undefined, amount = 0
  return {
    wake(now: number) { lastActivity = now },
    update(now: number, state: PetConversationState, pointer: PixelPoint | null, engaged: boolean) {
      lastActivity ??= now
      const hovering = pointer && Number.isFinite(pointer.x) && Number.isFinite(pointer.y)
        && pointer.x >= 0 && pointer.x <= 192 && pointer.y >= 0 && pointer.y <= 240
      if (engaged || state !== 'idle' || hovering) lastActivity = now
      const target = now - lastActivity >= PET_REST_DELAY ? 1 : 0
      const delta = previous === undefined ? 0 : Math.max(0, Math.min(100, now - previous))
      previous = now
      amount = clamp(amount + (target - amount) * (1 - Math.exp(-delta / (target ? 1600 : 140))))
      if (amount < .001) amount = 0
      return amount
    },
  }
}
