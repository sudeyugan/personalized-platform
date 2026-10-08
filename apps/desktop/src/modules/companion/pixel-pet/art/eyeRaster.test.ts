import { describe, expect, it, vi } from 'vitest'
import { prepareEye, renderEyePixels } from './eyeRaster'
import { artPlacement, type ArtProfile } from './artProfiles'

describe('clipped eyelash source fallback', () => {
  it('never uses blue patch-corner hair as a lid when a sampling column is outside the canvas', () => {
    const profile: ArtProfile = { style: 'chibi', label: 'fixture', src: '', width: 192, height: 240, edgeX: 96, edgeY: 240, pixelated: true, hands: [], eyes: [] }
    const artEye = { x: 191, y: 100, rx: 10, ry: 6, angle: 0, irisX: 191, irisY: 100, irisRx: 5, irisRy: 6 }
    const data = new Uint8ClampedArray(576 * 720 * 4)
    for (let p = 0; p < data.length; p += 4) data.set([255, 218, 200, 255], p)
    const fit = artPlacement(profile), cx = (fit.x + artEye.x * fit.scale) * 3, cy = (fit.y + artEye.y * fit.scale) * 3
    const radius = Math.ceil(Math.hypot(artEye.rx * fit.scale * 3 * 1.65, artEye.ry * fit.scale * 3 * 2) + 12)
    const x = Math.floor(cx - radius), y = Math.floor(cy - radius)
    data.set([70, 120, 220, 255], (y * 576 + x) * 4)
    const mock = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      createImageData: (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
    } as unknown as CanvasRenderingContext2D)
    try {
      const eye = prepareEye({ width: 576, height: 720, data } as ImageData, artEye, profile, 3)
      for (let p = 0; p < eye.lid.length; p += 4) expect(eye.lid[p + 2] > eye.lid[p] * 1.08 && eye.lid[p + 2] >= eye.lid[p + 1] * .94).toBe(false)
      expect(renderEyePixels(eye, { gaze: { x: 0, y: 0 }, eyeOpen: 1, blinkPhase: 'open', head: { x: 0, y: 0 }, hair: { x: 0, y: 0 }, breath: 0 }).data).toEqual(eye.original)
    } finally { mock.mockRestore() }
  })
})
