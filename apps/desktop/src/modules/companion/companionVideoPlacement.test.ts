import { describe, expect, it } from 'vitest'
import { companionVideoPlacementStyle, moveCompanionVideoPlacement, normalizeCompanionVideoPlacement } from './companionVideoPlacement'

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

  it('converts preview dragging into the persisted percentage placement', () => {
    expect(moveCompanionVideoPlacement({ scale: 1.1, x: 5, y: -2 }, 18, 32, 180, 320)).toEqual({
      scale: 1.1,
      x: 15,
      y: 8,
    })
    expect(moveCompanionVideoPlacement(undefined, 500, -500, 180, 320)).toEqual({
      scale: 1,
      x: 40,
      y: -40,
    })
  })
})
