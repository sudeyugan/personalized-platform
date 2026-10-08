import { describe, expect, it } from 'vitest'
import { includeUpperLashes } from './lashMask'

describe('upper lash blink coverage', () => {
  it('includes detached burgundy lash tips but preserves the eyebrow and cool hair', () => {
    const width = 80, original = new Uint8ClampedArray(width * width * 4), affected = new Uint8Array(width * width)
    const pixel = (x: number, y: number, rgba: number[]) => { const i = y * width + x; original.set(rgba, i * 4); return i }
    const lash = pixel(24, 26, [49, 7, 12, 255])
    const detachedTip = pixel(21, 28, [114, 94, 122, 255])
    const eyebrow = pixel(40, 13, [110, 60, 65, 255])
    const hair = pixel(46, 27, [153, 142, 174, 255])
    const cheek = pixel(40, 42, [220, 150, 145, 255])
    includeUpperLashes(original, affected, width, 40, 40, 16, 8, 1, 0)
    expect(affected[lash]).toBe(1)
    expect(affected[detachedTip]).toBe(1)
    expect(affected[eyebrow]).toBe(0)
    expect(affected[hair]).toBe(0)
    expect(affected[cheek]).toBe(0)
  })
})
