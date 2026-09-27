import { describe, expect, it } from 'vitest'
import { companionVideoPlacementStyle, normalizeCompanionVideoPlacement } from './companionVideoPlacement'

describe('companion WebM placement', () => {
  it('keeps legacy clips centered at their original scale', () => {
    expect(normalizeCompanionVideoPlacement()).toEqual({ scale: 1, x: 0, y: 0 })
    expect(companionVideoPlacementStyle()).toEqual({
      transform: 'translate3d(0%, 0%, 0) scale(1)',
      transformOrigin: 'center bottom',
    })
  })

  it('clamps imported placement values to the supported preview range', () => {
    expect(normalizeCompanionVideoPlacement({ scale: 9, x: -80, y: 55 })).toEqual({
      scale: 1.8,
      x: -40,
      y: 40,
    })
  })

  it('falls back when persisted values are not finite', () => {
    expect(normalizeCompanionVideoPlacement({ scale: Number.NaN, x: Number.POSITIVE_INFINITY, y: -4 })).toEqual({ scale: 1, x: 0, y: -4 })
  })
})
