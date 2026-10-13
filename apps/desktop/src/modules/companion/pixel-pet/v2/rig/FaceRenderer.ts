import type { PreparedArt } from '../../art/prepareArt'
import { drawOriginalEye } from '../../art/eyeRaster'
import { artPlacement } from '../../art/artProfiles'
import type { RigFrame } from '../animation/types'
import type { PixelRig } from './PixelRig'
export function prepareRigFace(art:PreparedArt,rig:PixelRig,frame:RigFrame) {
  const {face}=frame,changed=face.eyeOpen!==1||face.gazeX!==0||face.gazeY!==0||face.smile>.01||face.blush>.01||face.browRaise>.01||face.mouthOpen>.01
  if(!changed)return art.source
  const ctx=art.ctx,r=art.resolution
  ctx.clearRect(0,0,art.working.width,art.working.height);ctx.drawImage(art.source,0,0)
  const eyeFrame={gaze:{x:face.gazeX*2.3,y:face.gazeY*1.7},eyeOpen:Math.max(0,Math.min(1,face.eyeOpen)),blinkPhase:'open' as const,breath:0,head:{x:0,y:0},hair:{x:0,y:0}}
  art.eyes.forEach(eye=>drawOriginalEye(ctx,eye,eyeFrame))
  ctx.save();ctx.scale(r,r);ctx.imageSmoothingEnabled=false
  const fit=artPlacement(art.profile)
  for(const eye of art.profile.eyes){
    const x=fit.x+eye.x*fit.scale,y=fit.y+eye.y*fit.scale
    if(face.browRaise>.03){ctx.globalAlpha=face.browRaise*.55;ctx.fillStyle='#7288b5';ctx.fillRect(Math.round(x-3),Math.round(y-6-face.browRaise*2),5,1)}
    if(face.blush>.03){ctx.globalAlpha=face.blush*.35;ctx.fillStyle='#ef9caa';ctx.fillRect(Math.round(x-4),Math.round(y+7),7,2)}
  }
  if(face.mouthOpen>.04||face.smile>.04){
    const x=Math.round(rig.mouth.x),y=Math.round(rig.mouth.y)
    // Small raster differences over sampled artwork, no stretched mouth polygon.
    const colour=art.source.getContext('2d')!.getImageData(Math.max(0,(x+3)*r),Math.max(0,(y-2)*r),1,1).data
    ctx.globalAlpha=1;ctx.fillStyle=`rgb(${colour[0]},${colour[1]},${colour[2]})`;ctx.fillRect(x-3,y-2,7,5)
    ctx.fillStyle='#c9787f'
    if(face.mouthOpen>.15){const h=Math.max(1,Math.round(face.mouthOpen*3));ctx.fillRect(x-1,y,3,h);ctx.fillStyle='#f5adb0';ctx.fillRect(x,y+h-1,1,1)}
    else {ctx.fillRect(x-2,y,2,1);ctx.fillRect(x,y+Math.round(face.smile),2,1)}
  }
  ctx.restore();return art.working
}
