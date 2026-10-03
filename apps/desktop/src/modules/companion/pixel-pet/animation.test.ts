import { describe, expect, it } from 'vitest'
import { createPixelPetAnimator, EYE_CENTER, gazeTarget } from './animation'

describe('pixel pet animation', () => {
  it('computes continuous targets, not three-direction presets', () => {
    const first = gazeTarget({ x: EYE_CENTER.x + 10, y: EYE_CENTER.y })
    const second = gazeTarget({ x: EYE_CENTER.x + 20, y: EYE_CENTER.y })
    expect(first.x).toBeGreaterThan(0)
    expect(second.x).toBeGreaterThan(first.x)
    expect(second.x).toBeLessThan(3.5)
    expect(gazeTarget(EYE_CENTER)).toEqual({ x: 0, y: 0 })
  })
  it('clamps diagonal pupil movement inside the eye ellipse', () => {
    const value = gazeTarget({ x: 10000, y: -10000 })
    expect((value.x / 3.5) ** 2 + (value.y / 2) ** 2).toBeCloseTo(1)
    expect(value.x).toBeGreaterThan(0)
    expect(value.y).toBeLessThan(0)
    expect(gazeTarget({ x: NaN, y: 0 })).toEqual({ x: 0, y: 0 })
    expect(gazeTarget(null)).toEqual({ x: 0, y: 0 })
  })
  it('eases gaze and bounds frame deltas after inactivity', () => {
    const animator = createPixelPetAnimator(() => 1)
    animator.update(0, null)
    const first = animator.update(16, { x: 10000, y: EYE_CENTER.y }).gaze.x
    expect(first).toBeGreaterThan(0)
    expect(first).toBeLessThan(1)
    expect(animator.update(10000, { x: 10000, y: EYE_CENTER.y }).gaze.x).toBeLessThan(3.5)
  })
  it('runs open, closing, closed, opening and open with a fresh randomized delay', () => {
    const animator = createPixelPetAnimator(() => 0)
    expect(animator.update(0, null).blinkPhase).toBe('open')
    expect(animator.update(3199, null).blinkPhase).toBe('open')
    expect(animator.update(3200, null).blinkPhase).toBe('closing')
    expect(animator.update(3240, null).eyeOpen).toBeLessThan(1)
    expect(animator.update(3280, null).blinkPhase).toBe('closed')
    expect(animator.update(3280, null).eyeOpen).toBe(0)
    expect(animator.update(3350, null).blinkPhase).toBe('opening')
    expect(animator.update(3441, null).blinkPhase).toBe('open')
    expect(animator.update(6400, null).blinkPhase).toBe('open')
  })
  it('keeps motion subtle and the hair delayed; reduced motion fixes the head', () => {
    const animator = createPixelPetAnimator(() => 1)
    animator.update(0, null)
    const frame = animator.update(1000, null)
    expect(Math.abs(frame.breath)).toBeLessThanOrEqual(0.8)
    expect(Math.abs(frame.head.x)).toBeLessThanOrEqual(0.9)
    expect(Math.abs(frame.head.y)).toBeLessThanOrEqual(1.3)
    expect(frame.hair.x).not.toBe(frame.head.x)
    expect(animator.update(1100, null, true).head).toEqual({ x: 0, y: 0 })
    expect(animator.update(1100, null, true).breath).toBe(0)
  })
})
