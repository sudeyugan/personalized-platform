import type { FaceAttention,FaceGeometry } from './types'
import type { CameraPreferences } from './CameraPreferences'
import { createAdaptiveFilter } from './AdaptiveFilter'
const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n))
export function validFaceGeometry(value:unknown):value is FaceGeometry {
  if(!value||typeof value!=='object')return false
  const g=value as FaceGeometry
  return Object.keys(value).every(key=>['present','x','y','size','yaw','pitch','at'].includes(key))&&typeof g.present==='boolean'&&[g.x,g.y,g.size,g.yaw,g.pitch,g.at].every(Number.isFinite)&&g.x>=0&&g.x<=1&&g.y>=0&&g.y<=1&&g.size>=0&&g.size<=1&&Math.abs(g.yaw)<=Math.PI&&Math.abs(g.pitch)<=Math.PI
}
export function createGazeController() {
  let hits=0,lastGood=-Infinity,smoothed:FaceAttention|null=null
  const filters={x:createAdaptiveFilter(),y:createAdaptiveFilter(),distance:createAdaptiveFilter(1,.25),yaw:createAdaptiveFilter(),pitch:createAdaptiveFilter()}
  return {update(raw:FaceGeometry,preferences:CameraPreferences,now:number):FaceAttention {
    if(!validFaceGeometry(raw))raw={present:false,x:.5,y:.5,size:0,yaw:0,pitch:0,at:now}
    if(raw.present){hits++;lastGood=now}else hits=0
    const stable=raw.present&&hits>=3
    if(!stable){
      if(smoothed&&now-lastGood<1000)return {...smoothed,at:now}
      smoothed=null;Object.values(filters).forEach(filter=>filter.reset());return {present:false,x:0,y:0,distance:1,yaw:0,pitch:0,at:now}
    }
    const c=preferences.calibration,cx=c?.x??.5,cy=c?.y??.5
    // Centered top camera: calibration is the neutral direction, no arbitrary
    // mount offsets or user-head orientation mixed into the look-at position.
    const rangeGain=c?.rangeX?clamp(.2/c.rangeX,.7,1):1
    const x=clamp((raw.x-cx)*2*rangeGain*(preferences.mirror?-1:1),-1,1)||0,y=clamp((raw.y-cy)*2,-1,1)||0
    const target:FaceAttention={present:true,x,y,distance:clamp((c?.size??.28)/Math.max(.04,raw.size),.45,2.5),yaw:raw.yaw*(preferences.mirror?-1:1),pitch:raw.pitch,at:now}
    for(const key of ['x','y','distance','yaw','pitch'] as const)target[key]=filters[key].update(target[key],now)
    smoothed=target
    return {...smoothed}
  },reset(){hits=0;lastGood=-Infinity;smoothed=null;Object.values(filters).forEach(filter=>filter.reset())} }
}
