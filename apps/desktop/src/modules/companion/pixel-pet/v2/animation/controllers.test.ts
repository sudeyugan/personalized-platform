import { describe,expect,it } from 'vitest'
import { createSpring } from './SpringMotion'
import { createAnimationMixer } from './AnimationMixer'
import { createBehaviorController,type BehaviorInput } from '../behavior/BehaviorController'
import { createBehaviorScheduler } from '../behavior/BehaviorScheduler'
import { DEFAULT_PIXEL_ENHANCEMENTS,normalizePixelEnhancements } from '../../../../../domain/pixelPetEnhancements'
import { createMotionController } from './MotionController'
import { neutralRigFrame } from './types'
import { createPixelRig,skinWeights } from '../rig/PixelRig'
const defaults=(now=0):BehaviorInput=>({now,settings:{...DEFAULT_PIXEL_ENHANCEMENTS,enabled:true},pointer:null,camera:null,conversation:'idle',dragging:false,engaged:false,pat:0,response:0,reduced:false})
describe('pixel2 motion and priority',()=>{
  it('keeps legacy as the default and rejects unsupported configuration',()=>{
    expect(normalizePixelEnhancements()).toEqual(DEFAULT_PIXEL_ENHANCEMENTS)
    expect(normalizePixelEnhancements({enabled:true,windowMode:'unknown' as 'off',activity:'extreme' as 'natural'})).toEqual({...DEFAULT_PIXEL_ENHANCEMENTS,enabled:true})
  })
  it('keeps springs stable after gaps and sanitizes nonfinite targets',()=>{
    const spring=createSpring()
    for(let i=0;i<100;i++)expect(spring.step(1,1000)).toBeLessThanOrEqual(1.00001)
    expect(spring.step(NaN,.03)).toBeLessThan(1)
    spring.reset();expect(spring.step(0,.1)).toBe(0)
  })
  it('preserves the visible blend when another interaction interrupts mid-transition',()=>{
    const mixer=createAnimationMixer();expect(mixer.update(0,'neutral')).toEqual([{pose:'neutral',weight:1}])
    mixer.update(100,'wave');const before=mixer.update(200,'wave'),after=mixer.update(200,'chin')
    expect(after).toEqual(before)
    expect(mixer.update(400,'chin').reduce((sum,p)=>sum+p.weight,0)).toBeCloseTo(1)
    expect(mixer.update(500,'sleep',true)).toEqual([{pose:'sleep',weight:1}])
  })
  it('uses conditional cooldowns and never randomly interrupts sustained rest',()=>{
    const scheduler=createBehaviorScheduler(()=>0)
    expect(scheduler.step(0,0,true,'natural',false)).toBe('neutral')
    expect(scheduler.step(15000,20000,true,'natural',false)).toBe('touch-hair')
    expect(scheduler.step(30000,20000,true,'natural',false)).toBe('neutral')
    expect(scheduler.step(200000,180000,true,'natural',false)).toBe('sleep')
    expect(scheduler.step(600000,200000,true,'natural',false)).toBe('sleep')
    expect(scheduler.step(600001,200001,true,'natural',true)).toBe('neutral')
  })
  it('gives drag/pat/dialog priority over camera and idle without changing permissions',()=>{
    const controller=createBehaviorController(()=>0);controller.update(defaults())
    const camera={present:true,x:1,y:0,distance:1,yaw:0,pitch:0,at:100}
    expect(controller.update({...defaults(100),camera}).target).toEqual({x:196,y:72})
    const speaking=controller.update({...defaults(101),conversation:'speaking',camera:{...camera,at:101}})
    expect(speaking.target).toEqual({x:96,y:65});expect(speaking.speaking).toBe(true)
    const pat=controller.update({...defaults(102),pat:1,camera:{...camera,at:102}})
    expect(pat.expression).toBe('shy');expect(pat.target).toBeNull()
    expect(controller.update({...defaults(103),dragging:true,pat:1}).pose).toBe('neutral')
  })
  it('holds neutral identity and bounds all realtime joint and face channels',()=>{
    expect(Object.values(neutralRigFrame().joints).every(j=>j.x===0&&j.y===0&&j.angle===0)).toBe(true)
    const motion=createMotionController(()=>.5),behavior={pose:'neutral' as const,expression:'natural' as const,target:{x:10000,y:-10000},pat:false,speaking:false}
    for(let now=0;now<2000;now+=33){const frame=motion.update(now,behavior);expect(Math.abs(frame.joints.head.angle)).toBeLessThanOrEqual(.04301);expect(Math.abs(frame.joints.head.x)).toBeLessThanOrEqual(2.8001);expect(frame.face.eyeOpen).toBeGreaterThanOrEqual(0);expect(Math.abs(frame.face.gazeX)).toBeLessThanOrEqual(1.001)}
    const rig=createPixelRig({x:96,y:72}),a=skinWeights(80,100,rig),b=skinWeights(80,100.001,rig)
    expect(a.head+a.body).toBeCloseTo(1);expect(Math.abs(a.head-b.head)).toBeLessThan(.001)
  })
})
