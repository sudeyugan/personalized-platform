import { artEyeCenter,type ArtEye,type ArtProfile } from '../../art/artProfiles'
import { FREE_ART_PROFILES } from '../../art/freeArtProfiles'
import { prepareArtRows } from '../../art/deformation'
import { prepareEye } from '../../art/eyeRaster'
import { loadPreparedArt,type PreparedArt } from '../../art/prepareArt'
import type { PixelPetPose } from '../../types'
import type { RigPose } from '../animation/types'

const atlasUrl=new URL('./assets/pixel-keyposes-v2.png',import.meta.url).href
const names:Exclude<RigPose,'neutral'>[]=['wave','touch-hair','chin','stretch','sleep','peek']
// Points calibrated on the selected836×1881 atlas, local418×627 cells.
// Neutral is NEVER reconstructed from the atlas; use the unchanged approved art.
const eyes:[number,number,number,number][]=[
  [187,218,270,183],[172,219,255,189],[190,227,273,193],
  [163,204,244,203],[204,272,286,243],[183,224,271,193],
]
const neutralCenter=artEyeCenter(FREE_ART_PROFILES.pixel)
const neutralSpacing=(638-465)*Math.min(188/1024,236/1536)
let prepared:Promise<Map<Exclude<RigPose,'neutral'>,PreparedArt>>|undefined
function eye(x:number,y:number,closed:boolean):ArtEye {
  return {x,y,rx:18,ry:9,angle:-.35,irisX:x,irisY:y,irisRx:closed?0:12,irisRy:closed?0:11}
}
async function prepareAtlas() {
  const image=new Image();image.src=atlasUrl;await image.decode()
  if(image.naturalWidth!==836||image.naturalHeight!==1881)throw new Error('像素2.0姿态图尺寸与校准不符')
  const textures=new Map<Exclude<RigPose,'neutral'>,PreparedArt>()
  names.forEach((name,index)=>{
    const [x1,y1,x2,y2]=eyes[index],scale=neutralSpacing/Math.abs(x2-x1)
    let x=neutralCenter.x-(x1+x2)/2*scale,y=neutralCenter.y-(y1+y2)/2*scale
    if(name==='sleep')y=240-410*scale // forearms on the lower boundary, not body rotation
    if(name==='peek')x=192-400*scale // grasped side boundary
    const closed=name==='sleep'||name==='stretch'
    const profile:ArtProfile={style:'pixel',label:'像素2.0',src:atlasUrl,width:418,height:627,edgeX:400,pixelated:true,floating:true,hands:[],eyes:[eye(x1,y1,closed),eye(x2,y2,closed)],placement:{scale,x,y}}
    const resolution=3,source=document.createElement('canvas'),working=document.createElement('canvas')
    source.width=working.width=576;source.height=working.height=720
    const sourceCtx=source.getContext('2d',{willReadFrequently:true}),ctx=working.getContext('2d')
    if(!sourceCtx||!ctx)throw new Error('Canvas 2D不可用')
    sourceCtx.imageSmoothingEnabled=false
    sourceCtx.drawImage(image,index%2*418,Math.floor(index/2)*627,418,627,x*3,y*3,418*scale*3,627*scale*3)
    const pixels=sourceCtx.getImageData(0,0,576,720)
    textures.set(name,{profile,resolution,source,working,ctx,eyes:closed?[]:profile.eyes.map(e=>prepareEye(pixels,e,profile,resolution)),rows:prepareArtRows(profile,resolution)})
  })
  return textures
}
export async function loadRigAssets(pose:PixelPetPose) {
  const neutral=await loadPreparedArt('pixel',pose)
  if(!prepared)prepared=prepareAtlas().catch(error=>{prepared=undefined;throw error})
  const textures=new Map<RigPose,PreparedArt>(await prepared);textures.set('neutral',neutral)
  return textures
}
