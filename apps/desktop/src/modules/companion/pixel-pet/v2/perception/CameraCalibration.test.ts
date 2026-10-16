import { expect,it } from 'vitest'
import { createCameraCalibration } from './CameraCalibration'
import { normalizeCameraPreferences } from './CameraPreferences'
import { createGazeController } from './GazeController'
const raw=(at:number,x=.5)=>({present:true,x,y:.5,size:.28,yaw:0,pitch:0,at})
it('requires multiple stable fresh frames and learns an optional left/right range without retaining samples',()=>{
  const session=createCameraCalibration('device',true,0)
  expect(session.sample(raw(0),0).stage).toBe('center')
  for(let index=0;index<20;index++)session.sample(raw(0),50)
  expect(session.snapshot().count).toBe(1)
  for(let time=125;time<=1125;time+=125)session.sample(raw(time),time)
  expect(session.snapshot()).toMatchObject({stage:'left',center:{x:.5,y:.5,size:.28,deviceId:'device'}})
  for(let time=1250;time<=1875;time+=125)session.sample(raw(time,.65),time)
  expect(session.snapshot().stage).toBe('right')
  for(let time=2000;time<=2625;time+=125)session.sample(raw(time,.32),time)
  expect(session.snapshot()).toMatchObject({stage:'done',count:0,center:{rangeX:.165}})
  expect(Object.keys(session.snapshot().center!)).toEqual(['x','y','size','deviceId','rangeX'])
})
it('finishes stable calibration at higher camera frame rates rather than keeping an impossibly short window',()=>{
  for(const fps of [15,30,60]){
    const session=createCameraCalibration('',true,0)
    for(let index=0;index<fps*2&&session.snapshot().stage==='center';index++)session.sample(raw(index*1000/fps),index*1000/fps)
    expect(session.snapshot()).toMatchObject({stage:'left',center:{x:.5,y:.5}})
    const start=2000
    for(let index=0;index<fps*2&&session.snapshot().stage==='left';index++)session.sample(raw(start+index*1000/fps,.65),start+index*1000/fps)
    expect(session.snapshot().stage).toBe('right')
  }
})
it('does not accept shaking, stale/invalid samples, wrong-direction range or expired sessions',()=>{
  const session=createCameraCalibration('',true,0)
  for(let time=0;time<=2000;time+=125)session.sample(raw(time,time%250?.4:.6),time)
  expect(session.snapshot().stage).toBe('center')
  session.sample({...raw(2100),present:false},2100);expect(session.snapshot().count).toBe(0)
  session.sample(raw(1000),2200);expect(session.snapshot().count).toBe(0)
  expect(session.sample(raw(13001),13001)).toMatchObject({stage:'failed',center:undefined})
  const other=createCameraCalibration('',true,0)
  for(let time=0;time<=1125;time+=125)other.sample(raw(time),time)
  for(let time=1250;time<=2500;time+=125)other.sample(raw(time,.3),time)
  expect(other.snapshot()).toMatchObject({stage:'left',count:0})
  other.cancel();expect(other.snapshot().stage).toBe('failed')
})
it('keeps legacy calibration and consent unchanged, validates new parameters and never amplifies the old response',()=>{
  const old={x:.45,y:.55,size:.28,deviceId:''}
  expect(normalizeCameraPreferences({calibration:old})).toMatchObject({enabled:false,calibration:old})
  for(const rangeX of [NaN,Infinity,.001,1])expect(normalizeCameraPreferences({calibration:{...old,rangeX}}).calibration).toEqual(old)
  const measure=(rangeX?:number)=>{const gaze=createGazeController(),preferences=normalizeCameraPreferences({calibration:{...old,rangeX}});let result=gaze.update(raw(0,.65),preferences,0);for(let time=125;time<=2500;time+=125)result=gaze.update(raw(time,.65),preferences,time);return Math.abs(result.x)}
  expect(measure(.3)).toBeLessThan(measure());expect(measure(.07)).toBeLessThanOrEqual(measure())
})
