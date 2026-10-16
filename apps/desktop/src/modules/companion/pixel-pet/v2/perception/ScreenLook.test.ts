import { expect,it } from 'vitest'
import { cameraLook,restingLook } from './CameraLook'
import { petScreenGeometry,screenLookAim,type PetScreenGeometry } from './ScreenLook'
const center={x:96,y:72},face={present:true,x:0,y:0,distance:1,yaw:0,pitch:0,at:0}
const geometry=(x=1400,y=760):PetScreenGeometry=>({window:{position:{x,y},size:{width:192,height:240}},screen:{position:{x:0,y:0},size:{width:1920,height:1080}}})
it('changes look direction with the actual position even when attachment pose is unchanged',()=>{
  const left=cameraLook(0,face,center,'float',geometry(0,500))!,right=cameraLook(0,face,center,'float',geometry(1728,500))!
  expect(left.headLook.x).toBeGreaterThan(0);expect(right.headLook.x).toBeLessThan(0)
  const high=restingLook(center,'float',geometry(800,0)),low=restingLook(center,'float',geometry(800,840))
  expect(low.headLook.y).toBeLessThan(high.headLook.y)
  expect(restingLook(center,'bottom-edge',geometry(800,840)).headLook.y).toBeLessThan(-.5)
})
it('mirrors the local artwork once while preserving the physical inward direction',()=>{
  const left=cameraLook(0,face,center,'left-edge',geometry(0,500))!,right=cameraLook(0,face,center,'right-edge',geometry(1728,500))!
  expect(left.headLook.x).toBeCloseTo(right.headLook.x);expect(left.headLook.x).toBeLessThan(0)
})
it('is invariant to physical DPI scaling and negative display origins',()=>{
  const initial=geometry(),scaled=geometry()
  for(const rect of [scaled.screen,scaled.window]){rect.position.x=rect.position.x*2-3840;rect.position.y=rect.position.y*2-200;rect.size.width*=2;rect.size.height*=2}
  expect(screenLookAim(center,'float',scaled)).toEqual(screenLookAim(center,'float',initial))
  const monitors=[{position:scaled.screen.position,size:scaled.screen.size,scaleFactor:2,workArea:{position:scaled.screen.position,size:{width:3840,height:2080}}}]
  expect(petScreenGeometry(scaled.window,monitors)?.screen).toEqual(scaled.screen)
})
it('uses distance only as a bounded perspective hint and falls back safely when geometry is unavailable',()=>{
  const near=cameraLook(0,{...face,distance:.65},center,'float',geometry())!,far=cameraLook(0,{...face,distance:2},center,'float',geometry())!
  expect(Math.abs(near.headLook.x)).toBeGreaterThan(Math.abs(far.headLook.x))
  expect(Math.abs(near.headLook.y)).toBeGreaterThan(Math.abs(far.headLook.y))
  const invalid=geometry();invalid.screen.size.width=NaN
  expect(cameraLook(0,face,center,'float',invalid)).toEqual(cameraLook(0,face,center,'float'))
  expect(petScreenGeometry(geometry().window,[])).toBeNull()
})
