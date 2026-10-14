import { expect, it } from 'vitest'
import { createAdaptiveFilter } from './AdaptiveFilter'
import { createGazeController } from './GazeController'
import { normalizeCameraPreferences } from './CameraPreferences'

it('reduces static noise but responds faster to movement than a fixed cutoff',()=>{
  const filter=createAdaptiveFilter(),fixed=createAdaptiveFilter(1.35,0)
  filter.update(0,0);fixed.update(0,0)
  let noise=0
  for(let t=125;t<=5000;t+=125)noise=Math.max(noise,Math.abs(filter.update(t%250===0?.008:-.008,t)))
  expect(noise).toBeLessThan(.006)
  const fast=createAdaptiveFilter();fast.update(0,0)
  const slow=createAdaptiveFilter(1.35,0);slow.update(0,0)
  expect(fast.update(1,125)).toBeGreaterThan(slow.update(1,125))
  expect(fast.update(1,125)).toBeLessThanOrEqual(1)
  expect(fast.update(NaN,150)).toBeLessThanOrEqual(1)
  fast.reset();expect(fast.update(-1,1000)).toBe(-1)
})
it('normalizes old camera mount choices to top-center without granting consent',()=>{
  expect(normalizeCameraPreferences({mount:'left'})).toMatchObject({mount:'top',enabled:false})
  expect(normalizeCameraPreferences({enabled:true,mount:'bottom'})).toMatchObject({mount:'top',enabled:true})
})
it('keeps calibrated top-center neutral and mirrors direction once with loss/reset handling',()=>{
  const preferences=normalizeCameraPreferences({mirror:true,calibration:{x:.45,y:.55,size:.28,deviceId:''}})
  const gaze=createGazeController(),raw={present:true,x:.45,y:.55,size:.28,yaw:0,pitch:0,at:0}
  gaze.update(raw,preferences,0);gaze.update(raw,preferences,125)
  expect(gaze.update(raw,preferences,250)).toMatchObject({present:true,x:0,y:0,distance:1})
  expect(gaze.update({...raw,x:.65},preferences,375).x).toBeLessThan(0)
  expect(gaze.update({...raw,present:false},preferences,1500).present).toBe(false)
  gaze.reset();expect(gaze.update(raw,preferences,2000).present).toBe(false)
})
