import { describe, expect, it } from 'vitest'
import { FREE_ART_PROFILES } from './freeArtProfiles'
import { ART_PROFILES, artEyeCenter, artPlacement } from './artProfiles'
import { prepareArtRows } from './deformation'
describe('natural half-body mother textures', () => {
  it.each(Object.keys(FREE_ART_PROFILES) as (keyof typeof FREE_ART_PROFILES)[])('%s is separately calibrated and centered with no grip anchors', style => {
    const profile = FREE_ART_PROFILES[style], fit = artPlacement(profile), center = artEyeCenter(profile)
    expect(profile.src).not.toBe(ART_PROFILES[style].src)
    expect(profile.floating).toBe(true)
    expect(profile.hands).toEqual([])
    expect(fit.x * 2 + profile.width * fit.scale).toBeCloseTo(192)
    expect(center.x).toBeGreaterThan(30); expect(center.x).toBeLessThan(160)
    expect(center.y).toBeGreaterThan(30); expect(center.y).toBeLessThan(130)
    expect(prepareArtRows(profile, 3)[600].vertical).toBeGreaterThan(0)
  })
})
