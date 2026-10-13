import type { PixelPoint } from '../../types'
import type { FaceAttention } from '../perception/types'
import type { PetConversationState } from '../../conversation'
export function resolveAttention(now:number,pointer:PixelPoint|null,camera:FaceAttention|null,conversation:PetConversationState,strong:boolean) {
  if(strong)return {source:'interaction' as const,target:null}
  if(conversation!=='idle')return {source:'conversation' as const,target:{x:96,y:65}}
  if(camera?.present&&now-camera.at<1800)return {source:'camera' as const,target:{x:96+camera.x*100,y:72+camera.y*80}}
  if(pointer)return {source:'pointer' as const,target:pointer}
  return {source:'idle' as const,target:null}
}
