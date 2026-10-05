import { describe, expect, it } from 'vitest'
import { ART_PROFILES, PET_STYLES, artEyeCenter, artPlacement } from './artProfiles'
import { gazeTarget } from '../animation'
describe('approved art profiles', () => {
  it('retains all three distinct styles and rendering policies', () => {
    expect(PET_STYLES.map((p) => p.style)).toEqual(['detailed', 'pixel', 'chibi'])
    expect(ART_PROFILES.detailed.pixelated).toBe(false)
    expect(ART_PROFILES.pixel.pixelated).toBe(true)
    expect(ART_PROFILES.chibi.pixelated).toBe(true)
  })
  it.each(PET_STYLES)('fits $style without stretching and anchors the grasped edge', (profile) => {
    const fit = artPlacement(profile)
    expect(fit.x).toBeGreaterThanOrEqual(0)
    expect(fit.y).toBeGreaterThanOrEqual(0)
    expect(fit.x + profile.edgeX * fit.scale).toBeCloseTo(192)
    expect(fit.y + profile.height * fit.scale).toBeLessThanOrEqual(240)
    expect((profile.width * fit.scale) / (profile.height * fit.scale)).toBeCloseTo(profile.width / profile.height)
    const center = artEyeCenter(profile)
    expect(center.x).toBeGreaterThan(0); expect(center.x).toBeLessThan(192)
    expect(center.y).toBeGreaterThan(0); expect(center.y).toBeLessThan(240)
    expect(gazeTarget(center, center)).toEqual({ x: 0, y: 0 })
    expect(profile.hands).toHaveLength(2)
  })
})
