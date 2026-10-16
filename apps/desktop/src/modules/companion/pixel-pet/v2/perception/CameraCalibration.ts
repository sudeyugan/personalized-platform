import { validFaceGeometry } from './GazeController'
import type { FaceGeometry } from './types'
import type { CameraCalibration } from './CameraPreferences'
export type CalibrationStage='center'|'left'|'right'|'done'|'failed'
const median=(values:number[])=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)]
/** A bounded RAM sample window. Only aggregate calibration parameters can be
 * saved; cancelled/failed calibration never replaces an existing preference. */
export function createCameraCalibration(deviceId:string,mirror:boolean,now:number){
  let stage:CalibrationStage='center',started=now,lastAt=-Infinity,center:CameraCalibration|undefined,left=0,error=''
  let samples:FaceGeometry[]=[]
  const snapshot=()=>({stage,count:samples.length,required:stage==='center'?10:6,center: center?{...center}:undefined,error})
  const fail=(message:string)=>{stage='failed';samples=[];error=message}
  return {
    snapshot,
    sample(raw:FaceGeometry|null,at:number){
      if(stage==='done'||stage==='failed')return snapshot()
      if(at-started>12000){fail('校准等待超时，原校准未改变。请保持脸部可见后重试。');return snapshot()}
      if(!raw||!validFaceGeometry(raw)||!raw.present||raw.size<.06||at-raw.at>600||raw.at-at>100){samples=[];return snapshot()}
      // Bound calibration sampling by time, not camera FPS: ten frames must
      // still span a stable second on devices producing 30/60 FPS geometry.
      if(raw.at-lastAt<120)return snapshot()
      lastAt=raw.at
      const delta=center?(raw.x-center.x)*(mirror?-1:1):0
      if(stage!=='center'&&(Math.abs(raw.y-center!.y)>.08||Math.abs(raw.size-center!.size)>.07||Math.abs(delta)<.06||Math.abs(delta)>.35||stage==='left'&&delta>=0||stage==='right'&&delta<=0)){samples=[];return snapshot()}
      samples.push({...raw});samples=samples.slice(-(stage==='center'?10:6))
      const count=stage==='center'?10:6,span=stage==='center'?1000:600
      if(samples.length<count||samples.at(-1)!.at-samples[0].at<span)return snapshot()
      const stable=(key:'x'|'y'|'size',tolerance:number)=>Math.max(...samples.map(sample=>sample[key]))-Math.min(...samples.map(sample=>sample[key]))<=tolerance
      if(!stable('x',.035)||!stable('y',.035)||!stable('size',.045))return snapshot()
      const x=median(samples.map(sample=>sample.x))
      if(stage==='center'){center={x,y:median(samples.map(sample=>sample.y)),size:median(samples.map(sample=>sample.size)),deviceId};stage='left'}
      else if(stage==='left'){left=Math.abs(x-center!.x);stage='right'}
      else{center={...center!,rangeX:(left+Math.abs(x-center!.x))/2};stage='done'}
      samples=[];started=at;return snapshot()
    },
    cancel(){fail('已取消校准，原校准保持不变。')},
  }
}
