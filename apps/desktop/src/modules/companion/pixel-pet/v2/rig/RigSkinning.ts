import { gestureWeight, type RigArt } from './PoseAppearance'
import type { RigFrame } from '../animation/types'
import { clamp,createPixelRig,skinWeights } from './PixelRig'
import { artEyeCenter } from '../../art/artProfiles'
import { prepareRigFace,rigFacePatchBounds } from './FaceRenderer'
import { headTurnOffset } from './HeadTurn'

// Continuous inverse skinning: write every destination pixel from one connected
// texture. No cut-out neck/sleeve/hair islands, no invented exposed surfaces.
export function createRigSkinning(art:RigArt) {
  const rig=createPixelRig(artEyeCenter(art.profile)),r=art.resolution,w=art.source.width,h=art.source.height
  const output=document.createElement('canvas');output.width=w;output.height=h
  const ctx=output.getContext('2d',{willReadFrequently:true})!
  const pixels=ctx.createImageData(w,h)
  const original=art.source.getContext('2d',{willReadFrequently:true})!.getImageData(0,0,w,h).data
  const facePixels=original.slice()
  const facePatch=rigFacePatchBounds(art,rig)
  // Use a 2-logical-pixel influence grid; bilinear joint weights stay continuous.
  const rows=Array.from({length:h},(_,i)=>{
    const y=i/r,head=skinWeights(rig.head.x,y,rig).head
    return {y,head,body:1-head,anchor:art.profile.floating?1:art.rows[i]?.vertical??1}
  })
  const columns=Array.from({length:w},(_,i)=>{
    const x=i/r
    return {x,hair:clamp(Math.abs(x-rig.head.x)/50,0,1),anchor:art.profile.floating?1:art.profile.edgeY?1:clamp((192-x)/35,0,1)}
  })
  // A raised waving wrist does not share the neutral's arbitrary lower-arm mask.
  const gesture = art.gesture
  const handWeights = gesture ? new Float32Array(w * h) : undefined
  if (gesture && handWeights) for (let y=0;y<h;y++) for (let x=0;x<w;x++) handWeights[y*w+x]=gestureWeight(x/r,y/r,gesture)
  const quant=(n:number)=>Math.round(clamp(n,-3,3)*r)/r
  return {rig,draw(target:CanvasRenderingContext2D,frame:RigFrame) {
    const texture=prepareRigFace(art,rig,frame),j=frame.joints
    const still=!frame.headTurn&&Object.values(j).every(b=>!b.x&&!b.y&&!b.angle)
    if(still){target.drawImage(texture,0,0,192,240);return}
    let input=original
    if(texture!==art.source){
      // Only eyes/brows/blush/mouth differ from the approved base. Reuse the
      // full buffer and read back this bounded patch, not 1.6MB every frame.
      const {x,y,width:fw,height:fh}=facePatch
      const patch=texture.getContext('2d',{willReadFrequently:true})!.getImageData(x,y,fw,fh).data
      for(let row=0;row<fh;row++)facePixels.set(patch.subarray(row*fw*4,(row+1)*fw*4),((y+row)*w+x)*4)
      input=facePixels
    }
    const hx=quant(j.head.x),hy=quant(j.head.y),ha=clamp(j.head.angle,-.09,.09)
    const bx=quant(j.body.x),by=quant(j.body.y),ba=clamp(j.body.angle,-.018,.018)
    const rx=quant(j.root.x),ry=quant(j.root.y),hair=quant(j.hair.x),hairAngle=clamp(j.hair.angle,-.015,.015),la=clamp(j.leftArm.angle,-.08,.08)
    const turnOffsets=columns.map(col=>headTurnOffset(col.x-rig.head.x,1,frame.headTurn))
    for(let y=0;y<h;y++){
      const row=rows[y]
      const hairY=clamp((row.y-rig.head.y-12)/78,0,1)
      for(let x=0;x<w;x++){
        const col=columns[x],dx=col.x-rig.head.x,dy=row.y-rig.neckY
        const hand = handWeights?.[y*w+x] ?? 0
        const handX = gesture ? -(row.y-gesture.y)*la*hand : 0, handY = gesture ? (col.x-gesture.x)*la*hand : 0
        // A raised hand shares scanlines with the face, but is not head/hair.
        const connected = 1 - hand
        const sx=Math.round(x-((rx+((hx-dy*ha+turnOffsets[x])*row.head+(bx-(row.y-150)*ba)*row.body+(hair+hairAngle*(row.y-rig.head.y))*col.hair*hairY)*connected+handX)*col.anchor)*r)
        const sy=Math.round(y-((ry+((hy+dx*ha)*row.head+(by+dx*ba)*row.body)*connected+handY)*row.anchor)*r)
        const dst=(y*w+x)*4
        if(sx<0||sy<0||sx>=w||sy>=h){pixels.data[dst+3]=0;continue}
        const src=(sy*w+sx)*4
        pixels.data[dst]=input[src];pixels.data[dst+1]=input[src+1];pixels.data[dst+2]=input[src+2];pixels.data[dst+3]=input[src+3]
      }
    }
    ctx.putImageData(pixels,0,0);target.drawImage(output,0,0,192,240)
  } }
}
