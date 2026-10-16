import { nearestPixelMonitor,type PixelMonitor,type WindowGeometry } from '../../geometry'
import type { PixelPoint,PixelPetPose } from '../../types'
export interface PetScreenGeometry {window:WindowGeometry;screen:WindowGeometry}
type Monitor=PixelMonitor&Partial<WindowGeometry>
export function petScreenGeometry(window:WindowGeometry,monitors:Monitor[]):PetScreenGeometry|null{
  const monitor=nearestPixelMonitor(monitors,window) as Monitor|undefined
  if(!monitor)return null
  const screen={position:monitor.position??monitor.workArea.position,size:monitor.size??monitor.workArea.size}
  const result={window,screen}
  return validPetScreenGeometry(result)?result:null
}
export function validPetScreenGeometry(value:PetScreenGeometry){
  return [value.window,value.screen].every(rect=>[rect.position.x,rect.position.y,rect.size.width,rect.size.height].every(Number.isFinite)&&rect.size.width>0&&rect.size.height>0)
}
/** Physical coordinates throughout: no DPI multiplication or cursor input.
 * Current display's top center is an approximation, not camera localization. */
export function screenLookAim(center:PixelPoint,pose:PixelPetPose,geometry:PetScreenGeometry|null|undefined,distance=1){
  if(!geometry||!validPetScreenGeometry(geometry))return null
  const {window:pet,screen}=geometry,direction=pose==='left-edge'?-1:1
  const faceX=pet.position.x+(pose==='left-edge'?192-center.x:center.x)/192*pet.size.width
  const faceY=pet.position.y+center.y/240*pet.size.height
  const depth=Math.sqrt(Math.max(.65,Math.min(2,distance)))
  const dx=(screen.position.x+screen.size.width*.5-faceX)/(screen.size.width*.5)
  const dy=(faceY-screen.position.y)/screen.size.height
  return {x:Math.max(-.36,Math.min(.36,dx*.32/depth))*direction,y:Math.max(-.85,Math.min(-.06,(-.1-.48*dy-(pose==='bottom-edge'?.2:0))/depth))}
}
