import { describe, expect, it } from 'vitest'
import { ART_PROFILES, artPlacement, PET_STYLES } from './artProfiles'
import { gazeAxisLimit, gazeDisplacement } from './gazeSampling'
import { prepareIrisGaze, renderIrisGaze } from './gazeTexture'

function sampleEye() {
  const width = 25, height = 15, original = new Uint8ClampedArray(width * height * 4), aperture = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x, inside = ((x - 12) / 10) ** 2 + ((y - 7) / 5) ** 2 < 1
    aperture[i] = Number(inside)
    const iris = ((x - 12) / 3) ** 2 + ((y - 7) / 3) ** 2 < 1
    original.set(iris ? [55, 105, 190, 255] : inside ? [247, 248, 251, 255] : [65, 40, 53, 255], i * 4)
  }
  return prepareIrisGaze(original, width, height, aperture, 10, 5, 12, 7, 3, 3)
}
function blueCenter(data: Uint8ClampedArray, width: number) {
  let count = 0, total = 0
  for (let i = 0; i < data.length; i += 4) if (data[i + 2] > data[i] * 1.2) { count++; total += i / 4 % width }
  return total / count
}
describe('iris-only gaze', () => {
  it.each(PET_STYLES)('uses $style eye size, with bounded perceptible movement', (profile) => {
    const fit = artPlacement(profile), eye = profile.eyes[0]
    const rx = eye.rx * fit.scale, ry = eye.ry * fit.scale
    expect(gazeAxisLimit(rx)).toBeGreaterThan(1.9)
    expect(gazeAxisLimit(rx)).toBeLessThan(3)
    expect(gazeAxisLimit(ry, true)).toBeGreaterThan(1)
    expect(gazeAxisLimit(ry, true)).toBeLessThan(2.1)
    const shift = gazeDisplacement(rx, ry, 999, -999)
    expect(Math.hypot(shift.x / gazeAxisLimit(rx), shift.y / gazeAxisLimit(ry, true))).toBeCloseTo(1)
  })
  it('allows a larger Q eye range without changing the renderer viewport', () => {
    const detailed = ART_PROFILES.detailed, chibi = ART_PROFILES.chibi
    expect(gazeAxisLimit(chibi.eyes[0].rx * artPlacement(chibi).scale)).toBeGreaterThan(gazeAxisLimit(detailed.eyes[0].rx * artPlacement(detailed).scale))
  })
  it('retains every artist pixel at neutral gaze and safely ignores nonfinite targets', () => {
    const eye = sampleEye()
    expect(renderIrisGaze(eye, 0, 0)).toEqual(eye.original)
    expect(renderIrisGaze(eye, Infinity, NaN)).toEqual(eye.original)
  })
  it('really translates the original iris left/right instead of stretching it', () => {
    const eye = sampleEye()
    const original = blueCenter(eye.original, eye.width)
    const left = blueCenter(renderIrisGaze(eye, -3.5, 0), eye.width)
    const right = blueCenter(renderIrisGaze(eye, 3.5, 0), eye.width)
    expect(left).toBeLessThan(original - 2)
    expect(right).toBeGreaterThan(original + 2)
  })
  it('keeps outline, lashes and alpha unchanged, even at extreme gaze', () => {
    const eye = sampleEye(), moved = renderIrisGaze(eye, 100, -100)
    for (let i = 0; i < eye.aperture.length; i++) {
      if (!eye.aperture[i]) expect(moved.slice(i * 4, i * 4 + 4)).toEqual(eye.original.slice(i * 4, i * 4 + 4))
      expect(moved[i * 4 + 3]).toBe(eye.original[i * 4 + 3])
    }
  })
  it('interpolates fractional gaze and reuses bounded working memory', () => {
    const eye = sampleEye(), center = blueCenter(eye.original, eye.width)
    const first = renderIrisGaze(eye, .1, 0), a = blueCenter(first, eye.width)
    const next = renderIrisGaze(eye, .2, 0), b = blueCenter(next, eye.width)
    expect(first).toBe(next)
    expect(a).toBeGreaterThanOrEqual(center); expect(b).toBeGreaterThanOrEqual(a)
    expect(b - a).toBeLessThan(1)
  })
})
