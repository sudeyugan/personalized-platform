import { describe, expect, it } from 'vitest'
import { DEFAULT_PIXEL_ENHANCEMENTS } from '../../../../../domain/pixelPetEnhancements'
import { createBehaviorController, type BehaviorInput } from './BehaviorController'

const input = (now: number): BehaviorInput => ({
  now, settings: { ...DEFAULT_PIXEL_ENHANCEMENTS, enabled: true },
  pointer: null, camera: null, conversation: 'idle', dragging: false,
  engaged: false, pat: 0, response: 0, reduced: false,
})
const face = (at: number, present = true) => ({ present, at, x: 0, y: 0, distance: 1, yaw: 0, pitch: 0 })

describe('pixel2 gesture stability', () => {
  it('does not resume a cancelled greeting between 50ms pointer samples', () => {
    const controller = createBehaviorController(() => 0)
    controller.update(input(0))
    expect(controller.update({ ...input(10), response: 1 }).pose).toBe('wave')
    const poses = []
    for (let now = 33; now <= 1000; now += 33) {
      poses.push(controller.update({ ...input(now), response: 1, pointer: { x: Math.floor(now / 50) * 5, y: 70 } }).pose)
    }
    expect(new Set(poses)).toEqual(new Set(['neutral']))
    expect(controller.update({ ...input(1200), response: 1, pointer: { x: 100, y: 70 } }).pose).toBe('neutral')
  })
  it('cancels rather than resumes a gesture after drag, menu, pat, or dialogue', () => {
    for (const interruption of [{ dragging: true }, { engaged: true }, { pat: 1 }, { conversation: 'thinking' as const }]) {
      const controller = createBehaviorController(() => 0)
      controller.update(input(0))
      expect(controller.update({ ...input(10), response: 1 }).pose).toBe('wave')
      expect(controller.update({ ...input(20), response: 1, ...interruption }).pose).toBe('neutral')
      expect(controller.update({ ...input(100), response: 1, pat: interruption.pat ?? 0 }).pose).toBe('neutral')
    }
  })
  it('debounces camera presence fluctuations instead of alternating wave and peek', () => {
    const controller = createBehaviorController(() => 0)
    controller.update({ ...input(0), camera: face(0, false) })
    expect(controller.update({ ...input(10), camera: face(10) }).pose).toBe('wave')
    for (let now = 50; now <= 1000; now += 50) {
      expect(controller.update({ ...input(now), camera: face(now, now % 100 === 0) }).pose).toBe('wave')
    }
    expect(controller.update({ ...input(2000), camera: face(2000) }).pose).toBe('neutral')
    expect(controller.update({ ...input(9000), camera: face(9000, false) }).pose).toBe('peek')
  })
  it('keeps autonomous choices spaced at all activity levels during idle', () => {
    for (const activity of ['quiet', 'natural', 'lively'] as const) {
      const controller = createBehaviorController(() => 0)
      let previous = 'neutral', lastStart = -Infinity
      for (let now = 0; now <= 200000; now += 33) {
        const pose = controller.update({ ...input(now), settings: { ...input(now).settings, activity } }).pose
        if (pose !== previous && pose !== 'neutral') {
          expect(now - lastStart).toBeGreaterThanOrEqual(6500)
          lastStart = now
        }
        previous = pose
      }
    }
  })
})
