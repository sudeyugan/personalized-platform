import { listen } from '@tauri-apps/api/event'
import { availableMonitors,getCurrentWindow } from '@tauri-apps/api/window'
import { useEffect,useRef,useCallback } from 'react'
import type { PetWindowMode } from '../../../../../domain/pixelPetEnhancements'
import type { createPixelWindowLayout,PixelLayout } from '../../windowLayout'
import { edgeGeometry } from '../../geometry'
import { validWindowGeometry } from './WindowAwareness'
import { attachmentGeometry } from './WindowAttachment'
export function useWindowAttachment(controller:ReturnType<typeof createPixelWindowLayout>,onLayout:(layout:PixelLayout)=>void,active:boolean,mode:PetWindowMode,dragging:boolean,busy:boolean) {
  const paused=useRef(false),latest=useRef({onLayout,dragging,busy}),cancel=useRef<()=>void>(()=>{})
  latest.current={onLayout,dragging,busy}
  const pause=useCallback(()=>{paused.current=true;cancel.current();void controller.endAttachment(false).catch(()=>{})},[controller])
  useEffect(()=>{if(dragging)pause()},[dragging,pause])
  useEffect(()=>{
    paused.current=false
    if(!active||!['side','top'].includes(mode))return
    let stopped=false,revision=0,stop:(()=>void)|undefined,originalScale:number|undefined
    const owner=crypto.randomUUID()
    let queue=Promise.resolve()
    cancel.current=()=>{revision++}
    const restore=async()=>{const layout=await controller.endAttachment(true,owner);if(!stopped)latest.current.onLayout(layout)}
    void listen<unknown>('companion:pixel-window',({payload})=>{
      if(stopped||paused.current||latest.current.dragging||latest.current.busy)return
      const version=++revision
      queue=queue.catch(()=>{}).then(async()=>{
        if(stopped||paused.current||version!==revision)return
        if(!validWindowGeometry(payload)||!payload.available){await restore();return}
        const [all,scale]=await Promise.all([availableMonitors(),getCurrentWindow().scaleFactor()])
        if(originalScale===undefined)originalScale=scale
        const monitor=all.find(m=>Math.abs(m.workArea.position.x-payload.workLeft)<3&&Math.abs(m.workArea.position.y-payload.workTop)<3)
        if(stopped||paused.current||version!==revision)return
        // Different DPI/removed screen: return to the safe original placement.
        if(!monitor||Math.abs(monitor.scaleFactor-originalScale)>.01){await restore();return}
        const next=attachmentGeometry(payload,mode,edgeGeometry(monitor).size)
        if(!next){await restore();return}
        const layout=await controller.attach(next.geometry,next.pose,owner)
        if(!stopped&&!paused.current&&version===revision)latest.current.onLayout(layout)
      }).catch(()=>{if(!stopped)void restore().catch(()=>{})})
    }).then(unlisten=>{if(stopped)unlisten();else stop=unlisten}).catch(()=>{})
    return()=>{
      stopped=true;revision++;stop?.();cancel.current=()=>{}
      // Serial restoration does not touch WebM after a mode switch.
      void queue.catch(()=>{}).then(()=>controller.endAttachment(true,owner)).then(layout=>{if(layout.ready)latest.current.onLayout(layout)}).catch(()=>{})
    }
  },[controller,active,mode])
  return {pause}
}
