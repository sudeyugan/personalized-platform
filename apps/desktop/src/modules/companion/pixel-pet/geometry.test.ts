import { describe, expect, it } from 'vitest'
import { nearestPixelMonitor, rightEdgeGeometry, screenToPixel } from './geometry'

describe('pixel pet physical screen geometry', () => {
  it('docks to the right of a negative-coordinate secondary monitor at integer scale', () => {
    const monitor = { workArea: { position: { x: -1920, y: -200 }, size: { width: 1920, height: 1040 } }, scaleFactor: 1.25 }
    const value = rightEdgeGeometry(monitor)
    expect(value.scale).toBe(1)
    expect(value.size).toEqual({ width: 192, height: 240 })
    expect(value.position.x + value.size.width).toBe(0)
    expect(value.position.y).toBeGreaterThanOrEqual(-200)
    expect(value.position.y + value.size.height).toBeLessThanOrEqual(840)
  })
  it('halves the old default at integral desktop DPI while retaining crisp pixels', () => {
    for (const factor of [1, 2]) {
      const value = rightEdgeGeometry({ workArea: { position: { x: 0, y: 0 }, size: { width: 3840, height: 2160 } }, scaleFactor: factor })
      expect(value.scale).toBe(factor)
      expect(value.size).toEqual({ width: 192 * factor, height: 240 * factor })
    }
  })
  it('selects the display nearest the existing character instead of always the primary', () => {
    const left = { workArea: { position: { x: -1920, y: 0 }, size: { width: 1920, height: 1040 } }, scaleFactor: 1 }
    const right = { workArea: { position: { x: 0, y: 0 }, size: { width: 1920, height: 1040 } }, scaleFactor: 1 }
    expect(nearestPixelMonitor([right, left], { position: { x: -1500, y: 300 }, size: { width: 270, height: 480 } })).toBe(left)
    expect(nearestPixelMonitor([], { position: { x: 0, y: 0 }, size: { width: 1, height: 1 } })).toBeUndefined()
  })
  it('converts screen physical pixels to logical canvas coordinates including DPI and offsets', () => {
    const rect = { left: 10, top: 20, width: 384, height: 480 }
    const value = screenToPixel({ x: -985, y: 230 }, { x: -1000, y: 200 }, 1.5, rect)
    expect(value).toEqual({ x: 0, y: 0 })
    expect(screenToPixel({ x: -697, y: 590 }, { x: -1000, y: 200 }, 1.5, rect)).toEqual({ x: 96, y: 120 })
    expect(screenToPixel({ x: 0, y: 0 }, { x: 0, y: 0 }, 0, rect)).toBeNull()
  })
})
