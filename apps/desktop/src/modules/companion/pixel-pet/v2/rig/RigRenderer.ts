import type { RigArt } from './PoseAppearance'
import { artEyeCenter } from '../../art/artProfiles'
import { createRigSkinning } from './RigSkinning'
import type { RigFrame,RigPose } from '../animation/types'
export interface HeadHitGeometry {x:number;y:number;rx:number;ry:number}
export function createRigRenderer(textures:Map<RigPose,RigArt>) {
  const skins=new Map([...textures].map(([pose,art])=>[pose,createRigSkinning(art)]))
  const center=artEyeCenter(textures.get('neutral')!.profile)
  return { center,draw(ctx:CanvasRenderingContext2D,frame:RigFrame):HeadHitGeometry {
    ctx.clearRect(0,0,192,240);ctx.imageSmoothingEnabled=false
    let head:HeadHitGeometry={...center,rx:35,ry:42},largest=-1
    // Whole illustrations cannot be morphed by additive alpha: that creates
    // double hands and translucent sleeves. Switch one solid aligned silhouette.
    const visible=frame.poses.reduce((best,item)=>item.weight>best.weight?item:best,frame.poses[0])
    ctx.save()
    for(const item of visible?[visible]:[]){
      const skin=skins.get(item.pose);if(!skin||item.weight<=0)continue
      const x=0,y=0 // Every key pose is calibrated to this actual neutral.
      // Contact poses must keep hand/chin/hair contact rather than rotate the
      // face out of its supporting hand. Eyes can still follow independently.
      const contact=item.pose==='chin'||item.pose==='sleep'||item.pose==='touch-hair'
      const settled=contact?{...frame,headTurn:frame.headTurn*.15,joints:{...frame.joints,head:{x:frame.joints.head.x*.15,y:frame.joints.head.y*.15,angle:frame.joints.head.angle*.15},hair:{x:0,y:0,angle:0}}}:frame
      if(item.weight>largest){largest=item.weight;head={x:skin.rig.head.x+x+settled.joints.head.x,y:skin.rig.head.y+y+settled.joints.head.y,rx:35,ry:42}}
      ctx.save();ctx.translate(x,y);skin.draw(ctx,settled);ctx.restore()
    }
    ctx.restore();return head
  } }
}
