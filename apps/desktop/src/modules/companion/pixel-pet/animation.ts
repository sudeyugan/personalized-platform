import type { PixelPetFrame, PixelPoint } from './types'

export const EYE_CENTER: PixelPoint = { x: 128, y: 78 }
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export function gazeTarget(pointer: PixelPoint | null): PixelPoint {
  if (!pointer || !Number.isFinite(pointer.x) || !Number.isFinite(pointer.y)) return { x: 0, y: 0 }
  const dx = (pointer.x - EYE_CENTER.x) / 85
  const dy = (pointer.y - EYE_CENTER.y) / 100
  const distance = Math.max(1, Math.hypot(dx, dy))
  // Elliptical clamp; both eyes use the same target, not independent cross-eyed targets.
  return { x: clamp(dx / distance, -1, 1) * 3.5, y: clamp(dy / distance, -1, 1) * 2 }
}

export function createPixelPetAnimator(random = Math.random) {
  let lastTime: number | undefined
  let nextBlink: number | undefined
  let blinkStart: number | undefined
  const frame: PixelPetFrame = { gaze: { x: 0, y: 0 }, eyeOpen: 1, blinkPhase: 'open', breath: 0, head: { x: 0, y: 0 }, hair: { x: 0, y: 0 } }
  const blinkDelay = () => 3200 + clamp(random(), 0, 1) * 4200
  return {
    update(now: number, pointer: PixelPoint | null, reducedMotion = false): PixelPetFrame {
      const delta = lastTime === undefined ? 0 : clamp(now - lastTime, 0, 100)
      lastTime = now
      nextBlink ??= now + blinkDelay()
      if (blinkStart === undefined && now >= nextBlink) blinkStart = now
      const elapsed = blinkStart === undefined ? -1 : now - blinkStart
      if (elapsed < 0 || elapsed >= 240) {
        if (blinkStart !== undefined) { blinkStart = undefined; nextBlink = now + blinkDelay() }
        frame.eyeOpen = 1; frame.blinkPhase = 'open'
      } else if (elapsed < 70) {
        frame.eyeOpen = 1 - elapsed / 70; frame.blinkPhase = 'closing'
      } else if (elapsed < 130) {
        frame.eyeOpen = 0; frame.blinkPhase = 'closed'
      } else {
        frame.eyeOpen = (elapsed - 130) / 110; frame.blinkPhase = 'opening'
      }
      const target = gazeTarget(pointer)
      const easing = 1 - Math.exp(-delta / 110)
      frame.gaze.x += (target.x - frame.gaze.x) * easing
      frame.gaze.y += (target.y - frame.gaze.y) * easing
      frame.breath = reducedMotion ? 0 : Math.sin(now / 1250) * 0.8
      frame.head = reducedMotion ? { x: 0, y: 0 } : { x: Math.sin(now / 2100) * 0.9, y: frame.breath + Math.sin(now / 2700) * 0.5 }
      const hairEase = 1 - Math.exp(-delta / 320)
      frame.hair.x += (frame.head.x - frame.hair.x) * hairEase
      frame.hair.y += (frame.head.y - frame.hair.y) * hairEase
      return frame
    },
  }
}
