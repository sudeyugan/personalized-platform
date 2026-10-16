import { createSpring } from './SpringMotion'
import { createAnimationMixer } from './AnimationMixer'
import { FACE_PRESETS } from './MotionPresets'
import { neutralRigFrame, type FaceParameters, type RigFrame } from './types'
import type { BehaviorOutput } from '../behavior/BehaviorController'
import type { PixelPoint } from '../../types'
import { createEyeHeadCoordinator } from './EyeHeadCoordinator'
export function createMotionController(random=Math.random, eyeCenter:PixelPoint={x:96,y:72}) {
  const mixer=createAnimationMixer(),springs=new Map<string,ReturnType<typeof createSpring>>()
  const look=createEyeHeadCoordinator()
  let previous:number|undefined,nextBlink=2500+random()*2500,blinkStart=-Infinity
  let lastPose:BehaviorOutput['pose']='neutral',poseStarted=0
  const smooth=(key:string,target:number,dt:number,initial=0)=>{
    let spring=springs.get(key);if(!spring){const speed=key.startsWith('face:')?20:key.startsWith('hair:')?7:key.startsWith('head:')?11:9;spring=createSpring(initial,speed);springs.set(key,spring)}return spring.step(target,dt)
  }
  return { update(now:number,behavior:BehaviorOutput,reduced=false,movement?:PixelPoint):RigFrame {
    const dt=previous===undefined?0:(now-previous)/1000;previous=now
    if(lastPose!==behavior.pose){lastPose=behavior.pose;poseStarted=now}
    if(now>=nextBlink){blinkStart=now;nextBlink=now+2600+random()*5000}
    const blinkTime=now-blinkStart,blink=blinkTime>=0&&blinkTime<180?Math.abs(blinkTime-90)/90:1
    const frame=neutralRigFrame(),face={...FACE_PRESETS[behavior.expression]}
    const gazeX=Math.max(-1,Math.min(1,((behavior.target?.x??eyeCenter.x)-eyeCenter.x)/100))
    const gazeY=Math.max(-1,Math.min(1,((behavior.target?.y??eyeCenter.y)-eyeCenter.y)/90))
    let headX=Math.max(-1,Math.min(1,behavior.headLook?.x??gazeX)),headY=Math.max(-1,Math.min(1,behavior.headLook?.y??gazeY))
    if(behavior.coordinatedLook){const head=look.head({x:headX,y:headY},now);headX=head.x;headY=head.y}else look.reset()
    frame.joints.head={x:smooth('head:x',reduced?0:headX*2.2,dt),y:smooth('head:y',reduced?0:behavior.pat?1.4:headY*1.4,dt),angle:smooth('head:a',reduced?0:headX*.085,dt)}
    frame.headTurn=smooth('head:turn',reduced?0:headX*.75,dt)
    frame.poses=mixer.update(now,behavior.pose,reduced)
    const visible=frame.poses.reduce((best,item)=>item.weight>best.weight?item:best,frame.poses[0])?.pose
    const contact=visible==='chin'||visible==='sleep'||visible==='touch-hair',factor=contact ? .15 : 1
    const eyes=behavior.coordinatedLook?look.eyes({x:gazeX,y:gazeY},{x:frame.joints.head.x/2.2*factor,y:frame.joints.head.y/1.4*factor}):{x:gazeX,y:gazeY}
    face.gazeX=eyes.x;face.gazeY+=eyes.y;face.eyeOpen*=blink
    if(behavior.speaking)face.mouthOpen=.18+(Math.sin(now/105)+1)*.28
    for(const key of Object.keys(face) as (keyof FaceParameters)[])frame.face[key]=smooth('face:'+key,face[key],dt,key==='eyeOpen'?1:0)
    frame.joints.body.y=smooth('body:y',reduced?0:Math.sin(now/1800)*.22,dt)
    frame.joints.body.angle=smooth('body:a',reduced?0:headX*.008+Math.sin(now/4300)*.003,dt)
    frame.joints.hair.x=smooth('hair:x',reduced?0:frame.joints.head.x*.35-(movement?.x??0)*1.4,dt)
    frame.joints.hair.angle=smooth('hair:a',reduced?0:frame.joints.head.angle*.15+Math.sin(now/2700)*.003,dt)
    frame.joints.root.x=smooth('root:x',reduced?0:-(movement?.x??0)*1.2,dt)
    frame.joints.root.y=smooth('root:y',reduced?0:-(movement?.y??0)*.8,dt)
    const elapsed=Math.max(0,now-poseStarted),ease=Math.min(1,elapsed/450)
    frame.joints.leftArm.angle=smooth('arm:left',reduced||behavior.pose!=='wave'?0:Math.sin(elapsed/280)*.045*ease,dt)
    frame.joints.rightArm.y=smooth('arm:right',reduced||behavior.pose!=='touch-hair'?0:Math.sin(elapsed/600)*.25*ease,dt)
    frame.gazeTarget=behavior.target
    return frame
  } }
}
