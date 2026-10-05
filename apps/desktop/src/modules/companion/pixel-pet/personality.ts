import type { PixelPoint } from './types'

const clamp = (value: number) => Math.max(0, Math.min(1, value))
const pulse = (elapsed: number, duration: number) =>
  elapsed < 0 || elapsed >= duration ? 0 : Math.sin(Math.PI * elapsed / duration) ** 2
export const PET_IDLE_DELAY = 30_000
export const PET_PAT_COOLDOWN = 1800

// Ephemeral, local gestures only: no mouse history, timers or persistent state.
export function createPetPersonality(random = Math.random, eyeCenter: PixelPoint) {
  let previous: number | undefined, due: number | undefined
  let started: number | undefined, patStarted: number | undefined
  let lastPat = -Infinity, direction = 1, kind: 'tilt' | 'look' = 'tilt'
  let tilt = 0, squint = 0, looking = 0
  const delay = () => PET_IDLE_DELAY + clamp(random()) * 25_000
  return {
    pat(now: number) {
      if (!Number.isFinite(now) || now - lastPat < PET_PAT_COOLDOWN) return false
      lastPat = now; patStarted = now; started = undefined; due = now + delay()
      return true
    },
    update(now: number, blocked: boolean, reducedMotion = false, attentive = false) {
      const delta = previous === undefined ? 0 : Math.max(0, Math.min(100, now - previous))
      previous = now
      due ??= now + delay()
      if (blocked) { started = undefined; patStarted = undefined; due = now + delay() }
      if (attentive) { started = undefined; due = now + delay() }
      if (patStarted !== undefined && now - patStarted >= 1100) patStarted = undefined
      if (!blocked && !attentive && !reducedMotion && patStarted === undefined && started === undefined && now >= due) {
        started = now; direction = random() < .5 ? -1 : 1
        kind = kind === 'tilt' ? 'look' : 'tilt'
      }
      const activity = started === undefined ? 0 : pulse(now - started, 3000)
      const pat = patStarted === undefined ? 0 : pulse(now - patStarted, 1100)
      if (started !== undefined && now - started >= 3000) { started = undefined; due = now + delay() }
      const easing = 1 - Math.exp(-delta / 130)
      tilt += ((kind === 'tilt' ? activity * direction * .006 : 0) + pat * .004 - tilt) * easing
      squint += (pat * .82 - squint) * easing
      looking += ((kind === 'look' ? activity : 0) - looking) * easing
      if (Math.abs(tilt) < .00001 && !activity && !pat) tilt = 0
      if (squint < .001 && !pat) squint = 0
      if (looking < .001 && !activity) looking = 0
      if (reducedMotion) { tilt = 0; looking = 0; started = undefined; due = now + delay() }
      return {
        tilt, squint,
        pointer: looking ? { x: eyeCenter.x + 24 * direction * looking, y: eyeCenter.y + 6 * looking } : null,
      }
    },
  }
}
