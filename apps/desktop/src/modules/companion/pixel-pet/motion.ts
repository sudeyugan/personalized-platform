import type { PixelPetFrame, PixelPetPose, PixelPoint } from './types'

export interface PetMotionInput {
  pose: PixelPetPose; motion: number; sleep: number; reduced: boolean
  dragging: boolean; movement?: PixelPoint
  gesture: { tilt: number; squint: number }
}
// Presentation transforms must never feed back into the animator's easing state.
export function createPetMotion() {
  let previous: number | undefined, dragX = 0, dragY = 0
  return {
    update(now: number, source: PixelPetFrame, input: PetMotionInput): PixelPetFrame {
      const delta = previous === undefined ? 0 : Math.max(0, Math.min(100, now - previous))
      previous = now
      const easing = 1 - Math.exp(-delta / 190)
      const moving = input.dragging && !input.reduced
      dragX += ((moving ? -(input.movement?.x ?? 0) : 0) - dragX) * easing
      dragY += ((moving ? -(input.movement?.y ?? 0) : 0) - dragY) * easing
      if (Math.abs(dragX) < .001 && !moving) dragX = 0
      if (Math.abs(dragY) < .001 && !moving) dragY = 0
      const floating = input.pose === 'float'
      const amount = input.reduced ? 0 : input.motion * (1 - input.sleep * .8) * .25
      const tilt = input.reduced ? 0 : input.gesture.tilt
      return {
        ...source, gaze: { ...source.gaze },
        eyeOpen: Math.min(source.eyeOpen, 1 - input.gesture.squint) * (1 - input.sleep),
        // Free half-body: no perpetual scanline wobble. Only deliberate gestures/drag move it.
        breath: floating ? 0 : source.breath * amount,
        head: floating
          ? { x: dragX * .25, y: dragY * .2 }
          : { x: source.head.x * amount + tilt * 35, y: source.head.y * amount },
        hair: floating ? { x: 0, y: 0 } : { x: source.hair.x * amount, y: source.hair.y * amount },
        tilt: floating ? tilt : 0,
      }
    },
  }
}
