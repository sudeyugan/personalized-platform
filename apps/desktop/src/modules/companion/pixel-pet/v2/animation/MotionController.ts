import { createSpring } from './SpringMotion'
import { createAnimationMixer } from './AnimationMixer'
import { FACE_PRESETS } from './MotionPresets'
import { neutralRigFrame, type FaceParameters, type RigFrame } from './types'
import type { BehaviorOutput } from '../behavior/BehaviorController'
import type { PixelPoint } from '../../types'
export function createMotionController(random=Math.random, eyeCenter:PixelPoint={x:96,y:72}) {
  const mixer=createAnimationMixer(),springs=new Map<string,ReturnType<typeof createSpring>>()
  let previous:number|undefined,nextBlink=2500+random()*2500,blinkStart=-Infinity
  const smooth=(key:string,target:number,dt:number,initial=0)=>{
    let spring=springs.get(key);if(!spring){spring=createSpring(initial);springs.set(key,spring)}return spring.step(target,dt)
  }
  return { update(now:number,behavior:BehaviorOutput,reduced=false,movement?:PixelPoint):RigFrame {
    const dt=previous===undefined?0:(now-previous)/1000;previous=now
    if(now>=nextBlink){blinkStart=now;nextBlink=now+2600+random()*5000}
    const blinkTime=now-blinkStart,blink=blinkTime>=0&&blinkTime<180?Math.abs(blinkTime-90)/90:1
    const frame=neutralRigFrame(),face={...FACE_PRESETS[behavior.expression]}
    const gazeX=Math.max(-1,Math.min(1,((behavior.target?.x??eyeCenter.x)-eyeCenter.x)/100))
    const gazeY=Math.max(-1,Math.min(1,((behavior.target?.y??eyeCenter.y)-eyeCenter.y)/90))
    const headX=Math.max(-1,Math.min(1,behavior.headLook?.x??gazeX)),headY=Math.max(-1,Math.min(1,behavior.headLook?.y??gazeY))
    face.gazeX=gazeX;face.gazeY+=gazeY;face.eyeOpen*=blink
    if(behavior.speaking)face.mouthOpen=.18+(Math.sin(now/105)+1)*.28
    for(const key of Object.keys(face) as (keyof FaceParameters)[])frame.face[key]=smooth('face:'+key,face[key],dt,key==='eyeOpen'?1:0)
    frame.joints.head={x:smooth('head:x',reduced?0:headX*2.8,dt),y:smooth('head:y',reduced?0:behavior.pat?1.8:headY*1.6,dt),angle:smooth('head:a',reduced?0:headX*.043,dt)}
    frame.joints.body.y=smooth('body:y',reduced?0:Math.sin(now/1400)*.35,dt)
    frame.joints.body.angle=smooth('body:a',reduced?0:Math.sin(now/3700)*.008,dt)
    frame.joints.hair.x=smooth('hair:x',reduced?0:frame.joints.head.x*.35-(movement?.x??0)*1.4,dt)
    frame.joints.hair.angle=smooth('hair:a',reduced?0:Math.sin(now/2100)*.012,dt)
    frame.joints.root.x=smooth('root:x',reduced?0:-(movement?.x??0)*1.2,dt)
    frame.joints.root.y=smooth('root:y',reduced?0:-(movement?.y??0)*.8,dt)
    if(behavior.pose==='wave')frame.joints.leftArm.angle=reduced?0:Math.sin(now/180)*.07
    if(behavior.pose==='touch-hair')frame.joints.rightArm.y=reduced?0:Math.sin(now/420)*.4
    frame.poses=mixer.update(now,behavior.pose,reduced);frame.gazeTarget=behavior.target
    return frame
  } }
}
