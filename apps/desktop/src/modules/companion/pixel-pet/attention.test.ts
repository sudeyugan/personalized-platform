import { describe, expect, it, vi } from 'vitest'
import { createPetAttention } from './attention'
import { applyPoseTransform, posePointer } from './pose'
import { createPixelPetAnimator } from './animation'

describe('pet attention and mirrored gaze', () => {
  it('filters small hover jitter, but follows deliberate movement', () => {
    const attention = createPetAttention()
    attention.update(0, { x: 120, y: 80 })
    expect(attention.update(300, { x: 120, y: 80 }).pointer).toEqual({ x: 120, y: 80 })
    expect(attention.update(500, { x: 123, y: 82 }).pointer).toEqual({ x: 120, y: 80 })
    expect(attention.update(600, { x: 135, y: 85 }).pointer).toEqual({ x: 135, y: 85 })
    expect(attention.update(9000, { x: 135, y: 85 }).settling).toBe(false)
  })
  it('returns to neutral after six seconds outside and resumes on movement', () => {
    const attention = createPetAttention()
    const point = { x: -100, y: 100 }
    attention.update(0, point)
    expect(attention.update(5999, point).settling).toBe(false)
    expect(attention.update(6000, point)).toEqual({ pointer: null, settling: true })
    expect(attention.update(6200, { x: -110, y: 100 }).settling).toBe(false)
    expect(attention.update(6300, { x: NaN, y: 10 }).pointer).toBeNull()
    expect(attention.update(6400, point).settling).toBe(false)
  })
  it('does not count hover time across leaving and ignores subpixel jitter', () => {
    const attention = createPetAttention()
    attention.update(0, { x: 120, y: 100 })
    attention.update(200, { x: -20, y: 100 })
    attention.update(250, { x: 120, y: 100 })
    expect(attention.update(450, { x: 121, y: 100 }).pointer).toEqual({ x: 121, y: 100 })
    attention.update(500, { x: -20, y: 100 })
    expect(attention.update(6500, { x: -19.5, y: 100 }).settling).toBe(true)
  })
  it('mirrors coordinates and output, including outside-screen pointers', () => {
    expect(posePointer({ x: 20, y: 50 }, 'left-edge')).toEqual({ x: 172, y: 50 })
    expect(posePointer({ x: -100, y: 50 }, 'left-edge')).toEqual({ x: 292, y: 50 })
    expect(posePointer(null, 'left-edge')).toBeNull()
    const ctx = { setTransform: vi.fn() } as unknown as CanvasRenderingContext2D
    applyPoseTransform(ctx, 'left-edge')
    expect(ctx.setTransform).toHaveBeenCalledWith(-3, 0, 0, 3, 576, 0)
    applyPoseTransform(ctx, 'right-edge')
    expect(ctx.setTransform).toHaveBeenLastCalledWith(3, 0, 0, 3, 0, 0)
  })
  it('responds without restarting a blink and eases neutral return more slowly', () => {
    const animator = createPixelPetAnimator(() => 1)
    animator.update(0, null)
    animator.respond(100)
    expect(animator.update(140, null).blinkPhase).toBe('closing')
    animator.respond(150)
    expect(animator.update(180, null).blinkPhase).toBe('closed')
    expect(animator.update(341, null).eyeOpen).toBe(1)
    animator.respond(400)
    expect(animator.update(410, null).blinkPhase).toBe('open')
    animator.respond(800)
    expect(animator.update(840, null).blinkPhase).toBe('closing')
    const fast = createPixelPetAnimator(), slow = createPixelPetAnimator()
    for (const item of [fast, slow]) { item.update(0, null); item.update(100, { x: 1000, y: 84 }) }
    expect(slow.update(200, null, false, true).gaze.x).toBeGreaterThan(fast.update(200, null).gaze.x)
  })
})
