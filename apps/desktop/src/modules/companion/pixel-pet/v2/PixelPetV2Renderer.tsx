import { invoke } from '@tauri-apps/api/core'
import { useEffect,useRef,useState,type RefObject } from 'react'
import { PixelPetRenderer,type PixelPetRendererProps } from '../PixelPetRenderer'
import { applyPoseTransform,posePointer } from '../pose'
import type { PixelPoint } from '../types'
import type { PixelPetEnhancements } from '../../../../domain/pixelPetEnhancements'
import { createBehaviorController } from './behavior/BehaviorController'
import { createMotionController } from './animation/MotionController'
import { loadRigAssets } from './rig/RigAssets'
import { createRigRenderer,type HeadHitGeometry } from './rig/RigRenderer'
import { neutralRigFrame,type PetExpression,type RigPose } from './animation/types'
import type { FaceAttention } from './perception/types'
import { cameraLook, restingLook } from './perception/CameraLook'

export interface PixelPetV2Props extends PixelPetRendererProps {
  enhancements:PixelPetEnhancements;desktop?:boolean;headGeometry?:RefObject<HeadHitGeometry|null>
  camera?:RefObject<FaceAttention|null>;previewPose?:RigPose;previewExpression?:PetExpression;neutralPreview?:boolean
  onRenderError?:(cause:unknown)=>void
}
export function PixelPetV2Renderer(props:PixelPetV2Props) {
  const {pose='right-edge',active=true,scale=1,pixelRatio=1,headGeometry}=props
  const canvas=useRef<HTMLCanvasElement>(null),latest=useRef(props);latest.current=props
  const [ready,setReady]=useState(false),[error,setError]=useState('')
  const previewPointer=useRef<PixelPoint|null>(null),previewPat=useRef(0),previewResponse=useRef(0)
  useEffect(()=>{
    let stopped=false,request=0,lastDraw=-Infinity,renderer:ReturnType<typeof createRigRenderer>|undefined
    const element=canvas.current,ctx=element?.getContext('2d');if(!element||!ctx)return
    const side=pose==='left-edge'?'left-edge':pose==='bottom-edge'?'bottom-edge':'right-edge'
    const behavior=createBehaviorController(),reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)')
    let motion:ReturnType<typeof createMotionController>|undefined
    setReady(false);setError('')
    const draw=(now:number)=>{
      if(!renderer||!motion)return
      const p=latest.current,center=renderer.center,rawPointer=p.pointer?p.pointer.current:previewPointer.current
      const camera=p.camera?.current??null
      const cameraTarget=camera?{...camera,x:side==='left-edge'?-camera.x:camera.x}:null
      const b=behavior.update({now,settings:p.enhancements,pointer:posePointer(rawPointer,side),camera:cameraTarget,conversation:p.conversation??'idle',dragging:Boolean(p.dragging),engaged:Boolean(p.engaged),pat:p.headPat?.current??previewPat.current,response:p.response?.current??previewResponse.current,reduced:Boolean(reduced?.matches),previewPose:p.restPreview?'sleep':p.previewPose,previewExpression:p.previewExpression})
      // Camera/dialog targets are relative to the actual face, not canvas center.
      const look=cameraLook(now,camera,center,pose)
      if(look&&!p.dragging&&!p.engaged&&(p.conversation??'idle')==='idle'&&!b.pat){b.target=look.target;b.headLook=look.headLook}
      else if(!p.dragging&&!p.engaged&&!b.pat&&((p.conversation??'idle')!=='idle'||!b.target))Object.assign(b,restingLook(center,pose))
      const frame=p.neutralPreview?neutralRigFrame():motion.update(now,b,Boolean(reduced?.matches),p.dragMotion?.current)
      applyPoseTransform(ctx,side)
      const head=renderer.draw(ctx,frame)
      if(headGeometry)headGeometry.current={...head,x:side==='left-edge'?192-head.x:head.x}
    }
    const tick=(now:number)=>{
      request=0
      if(stopped||document.hidden||!active||!renderer||!motion)return
      if(now-lastDraw>=1000/30){lastDraw=now;draw(now)}
      request=requestAnimationFrame(tick)
    }
    const visibility=()=>{cancelAnimationFrame(request);request=0;if(!stopped&&renderer&&motion&&active&&!document.hidden)request=requestAnimationFrame(tick)}
    void loadRigAssets(pose).then(textures=>{
      if(stopped)return
      renderer=createRigRenderer(textures);motion=createMotionController(Math.random,renderer.center)
      draw(performance.now());setReady(true)
      visibility()
    }).catch(cause=>{if(!stopped){latest.current.onRenderError?.(cause);setError('像素2.0加载失败，已回退原版。');if(headGeometry)headGeometry.current=null}})
    document.addEventListener('visibilitychange',visibility)
    return()=>{stopped=true;cancelAnimationFrame(request);document.removeEventListener('visibilitychange',visibility);if(headGeometry)headGeometry.current=null}
  },[pose,active,headGeometry])
  useEffect(()=>{
    if(!props.desktop)return
    const lease=crypto.randomUUID()
    const publish=()=>{void invoke('pixel_pet_activation',{lease,active:active&&ready&&!document.hidden}).catch(()=>{})}
    publish();document.addEventListener('visibilitychange',publish)
    return()=>{document.removeEventListener('visibilitychange',publish);void invoke('pixel_pet_activation',{lease,active:false}).catch(()=>{})}
  },[props.desktop,active,ready])
  return <>
    {!ready&&<PixelPetRenderer {...props} style="pixel"/>}
    <canvas ref={canvas} className="pixel-pet-canvas" width={576} height={720} style={{display:ready?'block':'none',width:192*scale/pixelRatio,height:240*scale/pixelRatio}}
      data-pixel-pet-engine="v2" data-pixel-pet-style="pixel" data-pixel-pet-pose={pose} role="img" aria-label={`${props.name??'小鱼'}，像素2.0实时桌宠`}
      onPointerMove={event=>{if(props.pointer)return;const rect=event.currentTarget.getBoundingClientRect();previewPointer.current={x:(event.clientX-rect.left)/rect.width*192,y:(event.clientY-rect.top)/rect.height*240}}}
      onPointerLeave={()=>{previewPointer.current=null}}
      onClick={()=>{if(!props.pointer)previewPat.current++}} />
    {error&&<small className="pixel-pet-error" role="status">{error}</small>}
  </>
}
