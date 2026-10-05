import { describe, expect, it } from 'vitest'
import { isPetHead } from './headHit'
import { ART_PROFILES, artEyeCenter } from './art/artProfiles'
import { FREE_ART_PROFILES } from './art/freeArtProfiles'
import { BOTTOM_ART_PROFILES } from './art/bottomArtProfiles'
import type { CompanionPetStyle } from '../../../domain/models'

describe('head touch hit region', () => {
  it.each(['chibi', 'pixel', 'detailed'] as CompanionPetStyle[])('%s follows calibrated art in each pose', style => {
    for (const [pose, profiles] of [['float', FREE_ART_PROFILES], ['bottom-edge', BOTTOM_ART_PROFILES], ['right-edge', ART_PROFILES]] as const) {
      const point = artEyeCenter(profiles[style])
      expect(isPetHead(point, style, pose)).toBe(true)
      expect(isPetHead({ x: point.x, y: 220 }, style, pose)).toBe(false)
    }
    const point = artEyeCenter(ART_PROFILES[style])
    expect(isPetHead({ x: 192 - point.x, y: point.y }, style, 'left-edge')).toBe(true)
  })
  it('does not steal keyboard activation, transparent corners or invalid coordinates', () => {
    for (const point of [undefined, { x: 0, y: 0 }, { x: NaN, y: 80 }, { x: -100, y: 80 }]) {
      expect(isPetHead(point, 'chibi', 'float')).toBe(false)
    }
  })
})
