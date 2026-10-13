import { listen } from '@tauri-apps/api/event'
import { useEffect,useRef } from 'react'
import type { FaceAttention,WindowGeometryEvent } from './types'
import { validWindowGeometry } from '../desktop/WindowAwareness'
export function validAttention(value:unknown):value is FaceAttention {
  if(!value||typeof value!=='object')return false
  const face=value as FaceAttention
  return Object.keys(value).every(key=>['present','x','y','distance','yaw','pitch','at'].includes(key))&&typeof face.present==='boolean'&&[face.x,face.y,face.distance,face.yaw,face.pitch,face.at].every(Number.isFinite)&&Math.abs(face.x)<=1&&Math.abs(face.y)<=1&&face.distance>=.45&&face.distance<=2.5&&Math.abs(face.yaw)<=Math.PI&&Math.abs(face.pitch)<=Math.PI
}
export function usePetPerception(active:boolean) {
  const camera=useRef<FaceAttention|null>(null),windowGeometry=useRef<WindowGeometryEvent|null>(null)
  const windowChanged=useRef(-Infinity)
  useEffect(()=>{
    camera.current=null;windowGeometry.current=null;windowChanged.current=-Infinity
    if(!active)return
    let stopped=false;const stops:(()=>void)[]=[]
    const keep=(stop:()=>void)=>{if(stopped)stop();else stops.push(stop)}
    void listen<unknown>('companion:pixel-face',({payload})=>{
      if(stopped)return
      // Cross-WebView performance time origins differ; expire by arrival time.
      camera.current=validAttention(payload)&&Math.abs(Date.now()-payload.at)<2000?{...payload,at:performance.now()}:null
    }).then(keep).catch(()=>{})
    void listen<unknown>('companion:pixel-window',({payload})=>{
      if(stopped)return
      windowGeometry.current=validWindowGeometry(payload)?payload:null
      if(windowGeometry.current?.changed)windowChanged.current=performance.now()
    }).then(keep).catch(()=>{})
    return()=>{stopped=true;stops.forEach(stop=>stop());camera.current=null;windowGeometry.current=null;windowChanged.current=-Infinity}
  },[active])
  return {camera,windowGeometry,windowChanged}
}
