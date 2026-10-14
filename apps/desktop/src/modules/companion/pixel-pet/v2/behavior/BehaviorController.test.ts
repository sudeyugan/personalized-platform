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
  it('does not turn a chat activation into a wave while the chat snapshot is delayed',()=>{
    const controller=createBehaviorController(()=>0)
    controller.update(input(0))
    for(let now=10;now<=1000;now+=33){
      const output=controller.update({...input(now),response:1,conversation:now<500?'idle':'thinking'})
      expect(output.pose).toBe('neutral')
      expect(output.expression).toBe('natural')
    }
  })
  it('gives a UI activation priority over an existing or same-frame camera greeting',()=>{
    for(const sameFrame of [false,true]){
      const controller=createBehaviorController(()=>0)
      controller.update({...input(0),camera:face(0,false)})
      if(!sameFrame)expect(controller.update({...input(10),camera:face(10)}).pose).toBe('wave')
      expect(controller.update({...input(20),camera:face(20),response:1}).pose).toBe('neutral')
      expect(controller.update({...input(53),camera:face(53),response:1}).pose).toBe('neutral')
    }
  })
  it('wakes idle rest on UI activation without greeting or restarting sleep',()=>{
    const controller=createBehaviorController(()=>0)
    controller.update(input(0))
    expect(controller.update(input(200000)).pose).toBe('sleep')
    expect(controller.update({...input(200010),response:1}).pose).toBe('neutral')
    expect(controller.update({...input(200043),response:1}).pose).toBe('neutral')
  })
  it('does not resume a cancelled greeting between 50ms pointer samples', () => {
    const controller = createBehaviorController(() => 0)
    controller.update({ ...input(0), camera: face(0,false) })
    expect(controller.update({ ...input(10), camera: face(10) }).pose).toBe('wave')
    const poses = []
    for (let now = 33; now <= 1000; now += 33) {
      poses.push(controller.update({ ...input(now), camera: face(now), pointer: { x: Math.floor(now / 50) * 5, y: 70 } }).pose)
    }
    expect(new Set(poses)).toEqual(new Set(['neutral']))
    expect(controller.update({ ...input(1200), camera: face(1200), pointer: { x: 100, y: 70 } }).pose).toBe('neutral')
  })
  it('cancels rather than resumes a gesture after drag, menu, pat, or dialogue', () => {
    for (const interruption of [{ dragging: true }, { engaged: true }, { pat: 1 }, { conversation: 'thinking' as const }]) {
      const controller = createBehaviorController(() => 0)
      controller.update({ ...input(0), camera: face(0,false) })
      expect(controller.update({ ...input(10), camera: face(10) }).pose).toBe('wave')
      expect(controller.update({ ...input(20), camera: face(20), ...interruption }).pose).toBe('neutral')
      expect(controller.update({ ...input(100), camera: face(100), pat: interruption.pat ?? 0 }).pose).toBe('neutral')
    }
  })
  it('debounces camera presence fluctuations and looks curious without swapping to duplicate edge art', () => {
    const controller = createBehaviorController(() => 0)
    controller.update({ ...input(0), camera: face(0, false) })
    expect(controller.update({ ...input(10), camera: face(10) }).pose).toBe('wave')
    for (let now = 50; now <= 1000; now += 50) {
      expect(controller.update({ ...input(now), camera: face(now, now % 100 === 0) }).pose).toBe('wave')
    }
    expect(controller.update({ ...input(2000), camera: face(2000) }).pose).toBe('neutral')
    const searching = controller.update({ ...input(9000), camera: face(9000, false) })
    expect(searching.pose).toBe('neutral')
    expect(searching.expression).toBe('curious')
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
  it('wakes idle rest on meaningful face movement, not on small detector jitter', () => {
    const controller = createBehaviorController(() => 0)
    controller.update({ ...input(0), camera: face(0) })
    expect(controller.update({ ...input(200000), camera: face(200000) }).pose).toBe('sleep')
    expect(controller.update({ ...input(200033), camera: { ...face(200033), x: .01 } }).pose).toBe('sleep')
    expect(controller.update({ ...input(200066), camera: { ...face(200066), x: .2 } }).pose).toBe('neutral')
  })
})
