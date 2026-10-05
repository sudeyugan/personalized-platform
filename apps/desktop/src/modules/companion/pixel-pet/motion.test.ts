import { describe, expect, it } from 'vitest'
import { createPixelPetAnimator } from './animation'
import { createPetMotion, type PetMotionInput } from './motion'

const idle: PetMotionInput = { pose: 'float', motion: 1, sleep: 0, reduced: false, dragging: false, gesture: { tilt: 0, squint: 0 } }
describe('stable pet presentation', () => {
  it('keeps free body exactly stationary through 20 seconds of ambient animation', () => {
    const animator = createPixelPetAnimator(() => 1), motion = createPetMotion()
    for (let now = 0; now < 20_000; now += 34) {
      const frame = motion.update(now, animator.update(now, null), idle)
      expect(frame.head).toEqual({ x: 0, y: 0 })
      expect(frame.hair).toEqual({ x: 0, y: 0 })
      expect(frame.breath).toBe(0); expect(frame.tilt).toBe(0)
    }
  })
  it('does not leak rendering mutations into animator gaze/hair easing or older snapshots', () => {
    const animator = createPixelPetAnimator(() => 1), control = createPixelPetAnimator(() => 1)
    const first = animator.update(0, null), original = structuredClone(first)
    control.update(0, null)
    const source = animator.update(100, { x: 150, y: 80 })
    source.hair.x = 999; source.gaze.x = 999; source.head.y = 999
    expect(animator.update(134, null)).toEqual(control.update(100, { x: 150, y: 80 }) && control.update(134, null))
    expect(first).toEqual(original)
  })
  it('eases drag follow back to exact neutral and copies input frame', () => {
    const animator = createPixelPetAnimator(() => 1), source = animator.update(0, null)
    const original = structuredClone(source), motion = createPetMotion()
    motion.update(0, source, idle)
    const dragging = { ...idle, dragging: true, movement: { x: 1, y: -1 } }
    const moved = motion.update(100, source, dragging)
    expect(moved.head.x).toBeLessThan(0); expect(moved.head.y).toBeGreaterThan(0)
    for (let now = 134; now <= 3000; now += 34) motion.update(now, source, idle)
    expect(motion.update(3034, source, idle).head).toEqual({ x: 0, y: 0 })
    expect(source).toEqual(original)
  })
  it('combines squint, blink and rest without opening a closed eye; reduced motion stays still', () => {
    const source = createPixelPetAnimator(() => 1).update(0, null)
    const motion = createPetMotion()
    const input = { ...idle, sleep: .5, reduced: true, gesture: { tilt: .006, squint: .8 } }
    expect(motion.update(0, source, input).eyeOpen).toBeCloseTo(.1)
    expect(motion.update(100, { ...source, eyeOpen: 0 }, input).eyeOpen).toBe(0)
    expect(motion.update(134, source, input).tilt).toBe(0)
  })
})
