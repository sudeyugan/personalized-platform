import type { PreparedArt } from '../../art/prepareArt'
import { artEyeCenter } from '../../art/artProfiles'
import { createRigSkinning } from './RigSkinning'
import type { RigFrame,RigPose } from '../animation/types'
export interface HeadHitGeometry {x:number;y:number;rx:number;ry:number}
export function createRigRenderer(textures:Map<RigPose,PreparedArt>) {
  const skins=new Map([...textures].map(([pose,art])=>[pose,createRigSkinning(art)]))
  const center=artEyeCenter(textures.get('neutral')!.profile)
  const free=artEyeCenter(textures.get('wave')!.profile)
  return { center,draw(ctx:CanvasRenderingContext2D,frame:RigFrame):HeadHitGeometry {
    ctx.clearRect(0,0,192,240);ctx.imageSmoothingEnabled=false
    let head:HeadHitGeometry={...center,rx:35,ry:42},largest=-1
    ctx.save();ctx.globalCompositeOperation='lighter'
    for(const item of frame.poses){
      const skin=skins.get(item.pose);if(!skin||item.weight<=0)continue
      const x=item.pose==='neutral'||item.pose==='peek'?0:center.x-free.x
      const y=item.pose==='neutral'||item.pose==='sleep'?0:center.y-free.y
      if(item.weight>largest){largest=item.weight;head={x:skin.rig.head.x+x+frame.joints.head.x,y:skin.rig.head.y+y+frame.joints.head.y,rx:35,ry:42}}
      ctx.save();ctx.translate(x,y);ctx.globalAlpha=item.weight;skin.draw(ctx,frame);ctx.restore()
    }
    ctx.restore();return head
  } }
}
