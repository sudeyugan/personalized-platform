import type { PixelPetEnhancements } from '../../../../../domain/pixelPetEnhancements'
import type { PixelPoint } from '../../types'
import type { PetConversationState } from '../../conversation'
import type { FaceAttention } from '../perception/types'
import type { PetExpression, RigPose } from '../animation/types'
import { createBehaviorScheduler } from './BehaviorScheduler'
import { resolveAttention } from './AttentionController'
export interface BehaviorInput {
  now:number;settings:PixelPetEnhancements;pointer:PixelPoint|null;camera:FaceAttention|null
  conversation:PetConversationState;dragging:boolean;engaged:boolean;pat:number;response:number
  reduced:boolean;initiative?:number;windowChanged?:boolean;previewPose?:RigPose;previewExpression?:PetExpression
}
export interface BehaviorOutput { pose:RigPose;expression:PetExpression;target:PixelPoint|null;headLook?:PixelPoint;pat:boolean;speaking:boolean }
export function createBehaviorController(random=Math.random) {
  const scheduler=createBehaviorScheduler(random)
  let started:number|undefined,lastInteraction=0,lastPointer:PixelPoint|null=null,lastPat=0,lastResponse=0,patUntil=0,greetUntil=0,searchUntil=0
  let presence:boolean|undefined,pointerUntil=0,nextPresenceReaction=0
  let lastCamera:Pick<FaceAttention,'x'|'y'|'yaw'|'pitch'>|undefined
  return { update(input:BehaviorInput):BehaviorOutput {
    const {now,settings,pointer,camera,conversation,dragging,engaged}=input
    if(started===undefined){started=now;lastInteraction=now;lastPat=input.pat;lastResponse=input.response}
    const moved=pointer&&(!lastPointer||Math.hypot(pointer.x-lastPointer.x,pointer.y-lastPointer.y)>1.5)
    if(moved){lastPointer={...pointer};lastInteraction=now;pointerUntil=now+600}
    if(input.pat!==lastPat){lastPat=input.pat;patUntil=now+1800;lastInteraction=now;scheduler.interrupt(now)}
    // The shared response counter means body/chat/menu activation, not greeting.
    // Keep UI activation neutral even before the asynchronous chat state arrives.
    const activated=input.response!==lastResponse
    if(activated){lastResponse=input.response;greetUntil=0;searchUntil=0;lastInteraction=now;scheduler.interrupt(now)}
    if(dragging||engaged||conversation!=='idle')lastInteraction=now
    const present=Boolean(camera?.present&&now-camera.at<1800)
    if(present&&camera){
      const movedFace=lastCamera&&(Math.hypot(camera.x-lastCamera.x,camera.y-lastCamera.y)>.06||Math.abs(camera.yaw-lastCamera.yaw)>.12||Math.abs(camera.pitch-lastCamera.pitch)>.12)
      // Meaningful live movement wakes idle/rest. Keep only one scalar baseline;
      // don't interrupt greetings on every inference packet or detector jitter.
      if(movedFace){lastInteraction=now;scheduler.interrupt(now)}
      if(!lastCamera||movedFace)lastCamera={x:camera.x,y:camera.y,yaw:camera.yaw,pitch:camera.pitch}
    }else lastCamera=undefined
    if(camera&&presence!==undefined&&present!==presence&&now>=nextPresenceReaction){
      // Noisy presence packets must not restart or alternate whole-body gestures.
      nextPresenceReaction=now+8000
      if(present){greetUntil=now+1800;searchUntil=0;lastInteraction=now;scheduler.interrupt(now)}
      else {searchUntil=now+2800;greetUntil=0}
    }
    if(camera)presence=present
    const pat=now<patUntil,strong=dragging||engaged||pat
    const attention=resolveAttention(now,pointer,camera,conversation,strong)
    // Pointer samples arrive slower than animation frames. Hold the interruption
    // through their gaps and cancel the old gesture, rather than resume it next frame.
    const blocked=strong||activated||conversation!=='idle'||now<pointerUntil||input.reduced
    if(blocked){greetUntil=0;searchUntil=0}
    let pose=scheduler.step(now,now-lastInteraction,settings.autonomy,settings.activity,blocked,input.initiative)
    let expression:PetExpression=pose==='sleep'?'sleepy':pose==='chin'?'curious':'natural'
    if(now<searchUntil&&!blocked){pose='neutral';expression='curious'}
    if(now<greetUntil&&!blocked){pose='wave';expression='happy'}
    if(conversation!=='idle'){pose='neutral';expression=conversation==='speaking'?'happy':conversation==='error'?'curious':'natural'}
    if(pat){pose='neutral';expression='shy'}
    if(dragging||engaged){pose='neutral';expression='natural'}
    if(input.reduced)pose='neutral'
    return {pose:input.previewPose??pose,expression:input.previewExpression??expression,target:attention.target,pat,speaking:conversation==='speaking'}
  } }
}
