import type { RigJoint } from '../animation/types'
import type { PixelPoint } from '../../types'
export interface RigNode { name:RigJoint;parent:RigJoint|null;pivot:PixelPoint }
export interface PixelRig { nodes:RigNode[];head:PixelPoint;neckY:number;mouth:PixelPoint }
export function createPixelRig(eyeCenter:PixelPoint):PixelRig {
  return {
    head:eyeCenter,neckY:eyeCenter.y+30,mouth:{x:eyeCenter.x+5.5,y:eyeCenter.y+16},
    nodes:[
      {name:'root',parent:null,pivot:{x:96,y:230}},
      {name:'body',parent:'root',pivot:{x:eyeCenter.x,y:150}},
      {name:'head',parent:'body',pivot:{x:eyeCenter.x,y:eyeCenter.y+30}},
      {name:'leftArm',parent:'body',pivot:{x:eyeCenter.x-25,y:eyeCenter.y+47}},
      {name:'rightArm',parent:'body',pivot:{x:eyeCenter.x+25,y:eyeCenter.y+47}},
      {name:'hair',parent:'head',pivot:eyeCenter},
    ],
  }
}
export const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n))
export const smooth=(lo:number,hi:number,n:number)=>{const t=clamp((n-lo)/(hi-lo),0,1);return t*t*(3-2*t)}
export function skinWeights(x:number,y:number,rig:PixelRig) {
  const head=1-smooth(rig.neckY-12,rig.neckY+26,y)
  const hair=smooth(rig.head.y+12,rig.head.y+90,y)*clamp(Math.abs(x-rig.head.x)/50,0,1)
  const arm=(side:number)=>clamp(1-Math.abs(x-(rig.head.x+side*35))/45,0,1)*smooth(rig.head.y+24,rig.head.y+44,y)*(1-smooth(215,240,y))
  return {head,body:1-head,hair,leftArm:arm(-1),rightArm:arm(1)}
}
