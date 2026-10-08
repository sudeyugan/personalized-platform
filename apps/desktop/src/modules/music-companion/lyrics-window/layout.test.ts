import { describe, expect, it } from 'vitest'
import { lyricsPlacement } from './layout'
import { normalizeLyricsPreferences } from './preferences'
describe('lyrics placement and local preferences', () => {
  it('places compact lyrics outside the right-edge character and above a bottom pet', () => {
    const area = { x: 0, y: 0, width: 1920, height: 1040 }
    const side = lyricsPlacement({ x: 1728, y: 700, width: 192, height: 240 }, area, 1, false, true)
    expect(side.x + side.width).toBeLessThan(1728)
    const bottom = lyricsPlacement({ x: 0, y: 880, width: 1920, height: 160 }, area, 1, false, true)
    expect(bottom.y + bottom.height).toBeLessThan(880)
  })
  it('clamps remembered positions, negative-origin monitors and small work areas', () => {
    const area = { x: -1200, y: -400, width: 800, height: 600 }
    const rect = lyricsPlacement({ x: -500, y: -100, width: 96, height: 120 }, area, 2, true, true, { x: 5000, y: -5000 })
    expect(rect.x + rect.width).toBeLessThanOrEqual(-400)
    expect(rect.y).toBe(-400)
    expect(rect.y + rect.height).toBeLessThanOrEqual(200)
    expect(normalizeLyricsPreferences({ fontSize: 200, opacity: -20, position: { x: Infinity, y: 0 } })).toMatchObject({ fontSize: 28, opacity: 35, position: undefined })
  })
})
