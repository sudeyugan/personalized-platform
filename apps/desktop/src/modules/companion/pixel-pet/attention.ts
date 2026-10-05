import { PIXEL_PET_SIZE, type PixelPoint } from './types'

export interface PetAttention { pointer: PixelPoint | null; settling: boolean }
const valid = (point: PixelPoint | null) => point && Number.isFinite(point.x) && Number.isFinite(point.y)
const distance = (a: PixelPoint, b: PixelPoint) => Math.hypot(a.x - b.x, a.y - b.y)

// Per-renderer ephemeral state; no pointer history is stored or sent.
export function createPetAttention(bottom = false) {
  let anchor: PixelPoint | null = null
  let lastMove = 0
  let hoverStart: number | undefined
  let held: PixelPoint | null = null
  return {
    update(now: number, pointer: PixelPoint | null): PetAttention {
      if (!valid(pointer)) { anchor = null; held = null; hoverStart = undefined; return { pointer: null, settling: true } }
      const point = pointer!
      if (!anchor || distance(point, anchor) > 1.5) { anchor = { ...point }; lastMove = now }
      const hovering = point.x >= PIXEL_PET_SIZE.width * (bottom ? 0 : 0.32) && point.x <= PIXEL_PET_SIZE.width && point.y >= 0 && point.y <= PIXEL_PET_SIZE.height
      if (hovering) {
        hoverStart ??= now
        if (now - hoverStart >= 300) {
          if (!held || distance(point, held) > 6) held = { ...point }
          return { pointer: held, settling: false }
        }
      } else { hoverStart = undefined; held = null }
      return now - lastMove >= 6000 ? { pointer: null, settling: true } : { pointer: point, settling: false }
    },
  }
}
