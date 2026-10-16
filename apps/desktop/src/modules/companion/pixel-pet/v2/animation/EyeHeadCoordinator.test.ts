import { expect,it } from 'vitest'
import { createEyeHeadCoordinator } from './EyeHeadCoordinator'
import { createMotionController } from './MotionController'
const behavior=(x:number,pose:'neutral'|'wave'|'chin'='neutral')=>({pose,expression:'natural' as const,target:{x:96+x*100,y:72},headLook:{x,y:0},coordinatedLook:true,pat:false,speaking:false})
it('keeps small motion in eyes and requires a sustained direction before moving the head',()=>{
  const coordinator=createEyeHeadCoordinator()
  expect(coordinator.head({x:.12,y:0},0)).toEqual({x:0,y:0})
  expect(coordinator.head({x:.12,y:0},500)).toEqual({x:0,y:0})
  expect(coordinator.head({x:.6,y:0},600).x).toBe(0)
  expect(coordinator.head({x:.6,y:0},750).x).toBe(0)
  expect(coordinator.head({x:.6,y:0},800).x).toBeGreaterThan(0)
  expect(coordinator.head({x:-.6,y:0},850).x).toBe(0)
  expect(coordinator.head({x:-.6,y:0},1050).x).toBeLessThan(0)
  coordinator.reset();expect(coordinator.head({x:1,y:0},2000).x).toBe(0)
})
it('compensates using the actual delayed head, not its future target, within original limits',()=>{
  const motion=createMotionController(()=>.5)
  motion.update(0,behavior(.6));const early=motion.update(100,behavior(.6))
  expect(early.face.gazeX).toBeGreaterThan(.2);expect(early.joints.head.x).toBe(0)
  let settled=early
  for(let now=200;now<=2000;now+=33)settled=motion.update(now,behavior(.6))
  expect(settled.joints.head.x).toBeGreaterThan(0);expect(settled.joints.head.x).toBeLessThan(2.2)
  expect(settled.face.gazeX).toBeLessThan(.6)
  expect(settled.face.gazeX+settled.joints.head.x/2.2*.42).toBeCloseTo(.6,2)
  const reduced=createMotionController(()=>.5);reduced.update(0,behavior(1),true)
  expect(reduced.update(1000,behavior(1),true).joints.head).toEqual({x:0,y:0,angle:0})
})
it('compensates less for a contact pose whose actual renderer greatly reduces head movement',()=>{
  const run=(pose:'neutral'|'wave'|'chin')=>{const motion=createMotionController(()=>.5);let frame=motion.update(0,behavior(.6,pose));for(let now=33;now<=2000;now+=33)frame=motion.update(now,behavior(.6,pose));return frame}
  expect(run('chin').face.gazeX).toBeGreaterThan(run('neutral').face.gazeX)
  expect(run('wave').face.gazeX).toBeCloseTo(run('neutral').face.gazeX)
})
