import type { PetWindowMode } from '../../../../../domain/pixelPetEnhancements'
import type { WindowGeometryEvent } from '../perception/types'
import type { WindowGeometry } from '../../geometry'
import type { CompanionPetSide } from '../../../../../domain/models'
export function attachmentGeometry(event:WindowGeometryEvent,mode:PetWindowMode,size:WindowGeometry['size']):{geometry:WindowGeometry;pose:CompanionPetSide}|null {
  if(!event.available||!['side','top'].includes(mode)||size.width<=0||size.height<=0)return null
  const within=(x:number,y:number)=>x>=event.workLeft&&y>=event.workTop&&x+size.width<=event.workRight&&y+size.height<=event.workBottom
  if(mode==='top'){
    const x=Math.round((event.left+event.right-size.width)/2),y=event.top-size.height
    return within(x,y)?{geometry:{position:{x,y},size},pose:'bottom-edge'}:null
  }
  const y=Math.max(event.workTop,Math.min(event.workBottom-size.height,event.top+Math.round((event.bottom-event.top-size.height)*.35)))
  const left=event.left-size.width,right=event.right
  if(within(left,y))return {geometry:{position:{x:left,y},size},pose:'right-edge'}
  if(within(right,y))return {geometry:{position:{x:right,y},size},pose:'left-edge'}
  return null
}
