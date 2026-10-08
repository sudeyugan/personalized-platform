import { describe, expect, it } from 'vitest'
import { chatPlacement } from './chatPlacement'
describe('chat safe placement', () => {
  it.each([
    [1088, 120, 192, 240], [0, 120, 192, 240], [580, 480, 192, 240],
    [480, 0, 280, 400], [480, 180, 192, 240],
  ])('does not cover the character at (%s,%s)', (x, y, width, height) => {
    const pet = { x, y, width, height }
    for (const mode of ['voice', 'bubble', 'full'] as const) for (const character of ['pet', 'webm'] as const) {
      const p = chatPlacement(pet, { x: 0, y: 0, width: 1280, height: 720 }, 1, mode, character)
      expect(p.x).toBeGreaterThanOrEqual(0); expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.x + p.width).toBeLessThanOrEqual(1280); expect(p.y + p.height).toBeLessThanOrEqual(720)
      expect(p.x + p.width <= x || p.x >= x + width || p.y + p.height <= y || p.y >= y + height).toBe(true)
    }
  })
  it('bounds the actual native size on a small work area and uses negative origins', () => {
    const p = chatPlacement({ x: -400, y: 200, width: 192, height: 240 }, { x: -600, y: 0, width: 600, height: 400 }, 2, 'full', 'webm')
    expect(p.width).toBe(600); expect(p.height).toBe(400)
    expect(p.x).toBe(-600); expect(p.y).toBe(0)
  })
})
