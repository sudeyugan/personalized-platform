import { describe, expect, it, vi } from 'vitest'
import { PET_STYLES, artPlacement } from './artProfiles'
import { prepareArtRows, rowDisplacement, drawConnectedArt } from './deformation'
import { renderEyePixels, type PreparedEye } from './eyeRaster'
import { prepareIrisGaze } from './gazeTexture'
import type { PixelPetFrame } from '../types'

const neutral: PixelPetFrame = { gaze: { x: 0, y: 0 }, eyeOpen: 1, blinkPhase: 'open', head: { x: 0, y: 0 }, hair: { x: 0, y: 0 }, breath: 0 }
describe('connected approved-art deformation', () => {
  it.each(PET_STYLES)('$style keeps the grip fixed and mapping continuous at motion extremes', (profile) => {
    const rows = prepareArtRows(profile, 3), fit = artPlacement(profile)
    for (const sign of [-1, 1]) {
      const frame = { ...neutral, head: { x: sign, y: sign * 1.5 }, hair: { x: -sign, y: sign }, breath: sign }
      rows.forEach((row, i) => {
        const shift = rowDisplacement(row, frame)
        expect(Math.abs(shift.x)).toBeLessThanOrEqual(.8)
        expect(Math.abs(shift.y)).toBeLessThanOrEqual(.525)
        if (i) {
          const previous = rowDisplacement(rows[i - 1], frame)
          expect(Math.abs(shift.x - previous.x)).toBeLessThan(.03)
          expect(Math.abs(shift.y - previous.y)).toBeLessThan(.04)
          expect(i - shift.y * 3).toBeGreaterThan(i - 1 - previous.y * 3)
        }
      })
      for (const hand of profile.hands) {
        const y = fit.y + hand.reduce((n, point) => n + point[1], 0) / hand.length * profile.height * fit.scale
        expect(rowDisplacement(rows[Math.round(y * 3)], frame).y).toBeCloseTo(0)
      }
    }
  })
  it('fills every scanline exactly once and always anchors its right boundary', () => {
    const source = { width: 576, height: 720 } as HTMLCanvasElement
    const drawImage = vi.fn()
    const ctx = { drawImage } as unknown as CanvasRenderingContext2D
    const rows = prepareArtRows(PET_STYLES[0], 3)
    drawConnectedArt(ctx, source, rows, { ...neutral, head: { x: 1, y: 1 } }, 3)
    expect(drawImage).toHaveBeenCalledTimes(720)
    drawImage.mock.calls.forEach((args, i) => {
      expect(args[6]).toBe(i / 3)
      expect(args[8]).toBe(1 / 3)
      expect(args[5] + args[7]).toBeCloseTo(192)
      expect(args[4]).toBeGreaterThan(0)
    })
  })
  it('uses the complete original texture at rest instead of part masks', () => {
    const source = { width: 576, height: 720 } as HTMLCanvasElement
    const drawImage = vi.fn()
    drawConnectedArt({ drawImage } as unknown as CanvasRenderingContext2D, source, prepareArtRows(PET_STYLES[0], 3), neutral, 3)
    expect(drawImage).toHaveBeenCalledExactlyOnceWith(source, 0, 0, 192, 240)
  })
  it('preserves every neutral eye colour and does not alter pixels outside the aperture', () => {
    const original = new Uint8ClampedArray([40, 30, 45, 255, 70, 110, 180, 255, 255, 229, 214, 255])
    const eye = { original, pixels: { data: new Uint8ClampedArray(12) }, affected: new Uint8Array([0, 1, 0]), aperture: new Uint8Array([0, 1, 0]),
      width: 3, height: 1, rx: 1, ry: 1, cx: 1, cy: 0, cosine: 1, sine: 0, resolution: 3,
      gaze: prepareIrisGaze(original, 3, 1, new Uint8Array([0, 1, 0]), 1, 1, 1, 0, 1, 1) } as PreparedEye
    expect(renderEyePixels(eye, neutral).data).toEqual(original)
    const moved = renderEyePixels(eye, { ...neutral, gaze: { x: 3.5, y: 2 } }).data
    expect(moved.slice(0, 4)).toEqual(original.slice(0, 4))
    expect(moved.slice(8)).toEqual(original.slice(8))
  })
})
