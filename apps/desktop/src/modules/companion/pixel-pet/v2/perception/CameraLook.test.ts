import { describe, expect, it } from 'vitest'
import { cameraLook, restingLook } from './CameraLook'
import { createMotionController } from '../animation/MotionController'
import type { FaceAttention } from './types'

const center = { x: 96, y: 72 }
const face = (x = 0): FaceAttention => ({ present: true, x, y: 0, yaw: 0, pitch: 0, distance: 1, at: 0 })

describe('pixel2 visible continuous camera tracking', () => {
  it('reduces displacement by fifteen percent and mirrors it once', () => {
    const right = cameraLook(0, { ...face(.1), yaw: .2 }, center)!
    const left = cameraLook(0, { ...face(-.1), yaw: -.2 }, center)!
    expect(right.target.x - center.x).toBeCloseTo(Math.tanh(.25)*85)
    expect(left.target.x - center.x).toBeCloseTo(-Math.tanh(.25)*85)
    expect(right.headLook.x).toBeCloseTo(Math.tanh(.25)*.85)
    const mirrored = cameraLook(0, face(.1), center, 'left-edge')!
    expect(mirrored).toEqual(cameraLook(0, face(-.1), center, 'right-edge'))
    expect(mirrored.headLook.x).toBeLessThan(0)
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
    expect(look.target.x).toBeCloseTo(center.x + Math.tanh(2.5)*85)
    expect(look.headLook.y).toBeCloseTo(Math.tanh(-.12)+.85*(Math.tanh(-1.92)-Math.tanh(-.12)))
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
    expect(right.joints.head.x - left.joints.head.x).toBeGreaterThan(1.7)
    expect(right.face.gazeX - left.face.gazeX).toBeCloseTo(Math.tanh(.5)*1.7,3)
    expect(right.joints.head.angle-left.joints.head.angle).toBeGreaterThan(.065)
    expect(right.headTurn-left.headTurn).toBeGreaterThan(.58)
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
  it('looks up from a bottom grip and into the screen from either side, including idle',()=>{
    const bottom=cameraLook(0,face(),center,'bottom-edge')!
    expect(bottom.headLook.y).toBeLessThan(-.6)
    expect(cameraLook(0,{...face(),y:.2},center,'bottom-edge')!.headLook.y).toBeLessThan(-.4)
    expect(restingLook(center,'bottom-edge')).toEqual(bottom)
    for(const pose of ['right-edge','left-edge'] as const){
      expect(cameraLook(0,face(),center,pose)!.headLook.x).toBeLessThan(0)
      expect(restingLook(center,pose).headLook.y).toBeLessThan(0)
    }
  })
  it('does not add a downward expression bias to an explicit person target',()=>{
    const motion=createMotionController(()=>.5,center)
    let frame
    for(let now=0;now<=1000;now+=33)frame=motion.update(now,{pose:'neutral',expression:'shy',target:{x:96,y:27},pat:false,speaking:false})
    expect(frame!.face.gazeY).toBeCloseTo(-.5,3)
  })
  it('keeps every neutral placement baseline unchanged while reducing movement around it',()=>{
    const aim={float:{x:0,y:-.12},'bottom-edge':{x:0,y:-.8},'left-edge':{x:-.18,y:-.22},'right-edge':{x:-.18,y:-.22}}
    for(const pose of ['float','bottom-edge','left-edge','right-edge'] as const){
      expect(cameraLook(0,face(),center,pose)).toEqual(restingLook(center,pose))
      const look=cameraLook(0,{...face(.6),y:.4},center,pose)!,base=restingLook(center,pose)
      expect(look.headLook.x-base.headLook.x).toBeCloseTo(.85*(Math.tanh((pose==='left-edge'?-.6:.6)*2.5+aim[pose].x)-base.headLook.x))
      expect(look.headLook.y-base.headLook.y).toBeCloseTo(.85*(Math.tanh(.4*1.8+aim[pose].y)-base.headLook.y))
    }
  })
})
