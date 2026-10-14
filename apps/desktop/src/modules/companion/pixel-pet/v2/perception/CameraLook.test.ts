import { describe, expect, it } from 'vitest'
import { cameraLook } from './CameraLook'
import { createMotionController } from '../animation/MotionController'
import type { FaceAttention } from './types'

const center = { x: 96, y: 72 }
const face = (x = 0): FaceAttention => ({ present: true, x, y: 0, yaw: 0, pitch: 0, distance: 1, at: 0 })

describe('pixel2 visible continuous camera tracking', () => {
  it('amplifies a small displacement symmetrically and mirrors position and orientation once', () => {
    const right = cameraLook(0, { ...face(.1), yaw: .2 }, center)!
    const left = cameraLook(0, { ...face(-.1), yaw: -.2 }, center)!
    expect(right.target.x - center.x).toBeCloseTo(Math.tanh(.25)*100)
    expect(left.target.x - center.x).toBeCloseTo(-Math.tanh(.25)*100)
    expect(right.headLook.x).toBeCloseTo(Math.tanh(.25))
    expect(cameraLook(0, { ...face(.1), yaw: .2 }, center, true)).toEqual(left)
  })
  it('ignores missing, stale and nonfinite input instead of locking the avatar onto an old face', () => {
    expect(cameraLook(0, null, center)).toBeNull()
    expect(cameraLook(0, { ...face(), present: false }, center)).toBeNull()
    expect(cameraLook(1801, face(), center)).toBeNull()
    expect(cameraLook(0, { ...face(), at: 101 }, center)).toBeNull()
    expect(cameraLook(0, { ...face(), yaw: NaN }, center)).toBeNull()
  })
  it('bounds strong movements without enlarging any skinning limits', () => {
    const look = cameraLook(0, { ...face(1), y: -1, yaw: 3, pitch: -3 }, center)!
    expect(look.target.x).toBeGreaterThan(190);expect(look.target.x).toBeLessThan(196)
    expect(look.target.y).toBeGreaterThan(-18);expect(look.target.y).toBeLessThan(-10)
    expect(look.headLook.x).toBeLessThan(1);expect(look.headLook.y).toBeGreaterThan(-1)
  })
  it('makes ordinary left/right movement visible in the joints without changing neutral pose', () => {
    const settle = (x: number) => {
      const motion = createMotionController(() => .5, center)
      const look = cameraLook(0, face(x), center)!
      let frame
      for (let now = 0; now <= 1000; now += 33) frame = motion.update(now, { ...look, pose: 'neutral', expression: 'natural', pat: false, speaking: false })
      return frame!
    }
    const right = settle(.2), left = settle(-.2)
    expect(right.joints.head.x - left.joints.head.x).toBeGreaterThan(2)
    expect(right.face.gazeX - left.face.gazeX).toBeGreaterThan(.9)
    expect(right.joints.head.angle-left.joints.head.angle).toBeGreaterThan(.075)
    expect(right.headTurn-left.headTurn).toBeGreaterThan(.65)
    expect(right.poses).toEqual([{ pose: 'neutral', weight: 1 }])
    expect(left.poses).toEqual(right.poses)
  })
  it('keeps reduced-motion head still even with amplified camera tracking', () => {
    const look = cameraLook(0, face(1), center)!, motion = createMotionController(() => .5, center)
    expect(motion.update(0, { ...look, pose: 'neutral', expression: 'natural', pat: false, speaking: false }, true).joints.head).toEqual({ x: 0, y: 0, angle: 0 })
  })
  it('looks at position even when the person turns back towards the monitor',()=>{
    const positive=cameraLook(0,{...face(.3),yaw:-1,pitch:-1},center)!
    expect(positive.headLook.x).toBeGreaterThan(0)
    expect(positive).toEqual(cameraLook(0,{...face(.3),yaw:1,pitch:1},center))
  })
})
