import { describe, expect, it } from 'vitest'
import { BOTTOM_ART_PROFILES } from './bottomArtProfiles'
import { artEyeCenter, artPlacement } from './artProfiles'
import { prepareArtRows, rowDisplacement } from './deformation'

describe('independent bottom-edge mother art', () => {
  it.each(Object.values(BOTTOM_ART_PROFILES))('$style preserves proportions and anchors the horizontal forearms', profile => {
    const fit = artPlacement(profile)
    expect(fit.x).toBeGreaterThanOrEqual(0)
    expect(fit.y).toBeGreaterThanOrEqual(0)
    expect(fit.y + profile.edgeY! * fit.scale).toBeCloseTo(240)
    expect(profile.width * fit.scale).toBeLessThanOrEqual(192)
    const eye = artEyeCenter(profile)
    expect(eye.x).toBeGreaterThan(0); expect(eye.x).toBeLessThan(192)
    expect(eye.y).toBeGreaterThan(0); expect(eye.y).toBeLessThan(200)
    expect(profile.src).toContain('bottom-v1.png')
    const rows = prepareArtRows(profile, 3)
    const handY = fit.y + profile.hands[0].reduce((n, p) => n + p[1], 0) / 4 * profile.height * fit.scale
    const displacement = rowDisplacement(rows[Math.min(720, Math.round(handY * 3))], { head: { x: 1, y: 1.5 }, hair: { x: -1, y: 1 }, gaze: { x: 3.5, y: 2 }, eyeOpen: 1, blinkPhase: 'open', breath: 1 })
    expect(displacement.x).toBeCloseTo(0); expect(displacement.y).toBeCloseTo(0)
  })
})
