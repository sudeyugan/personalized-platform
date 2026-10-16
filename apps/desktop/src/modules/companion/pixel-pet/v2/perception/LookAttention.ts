import type { BehaviorOutput } from '../behavior/BehaviorController'
import type { PetConversationState } from '../../conversation'
import type { PixelPoint,PixelPetPose } from '../../types'
import type { FaceAttention } from './types'
import type { PetScreenGeometry } from './ScreenLook'
import { cameraLook,restingLook } from './CameraLook'

export function personLook(now:number,face:FaceAttention|null,center:PixelPoint,pose:PixelPetPose,screen:PetScreenGeometry|null|undefined,behavior:BehaviorOutput,conversation:PetConversationState,strong:boolean):BehaviorOutput{
  if(strong||behavior.pat)return behavior
  const rest=restingLook(center,pose,screen),look=cameraLook(now,face,center,pose,screen)
  const target=look??rest
  // Keep a softer live target while talking, instead of replacing it with a
  // fixed forward stare. Gestures own their joints, not the person's location.
  const weight=conversation==='idle'?1:.72
  return {...behavior,coordinatedLook:true,target:{x:rest.target.x+(target.target.x-rest.target.x)*weight,y:rest.target.y+(target.target.y-rest.target.y)*weight},headLook:{x:rest.headLook.x+(target.headLook.x-rest.headLook.x)*weight,y:rest.headLook.y+(target.headLook.y-rest.headLook.y)*weight}}
}
