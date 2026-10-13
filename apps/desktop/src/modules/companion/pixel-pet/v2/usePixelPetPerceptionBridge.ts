import { Channel,invoke,isTauri } from '@tauri-apps/api/core'
import { emitTo } from '@tauri-apps/api/event'
import { useEffect,useRef,useState } from 'react'
import type { CompanionDesktopSnapshot } from '../../companionDesktop'
import { normalizePixelEnhancements } from '../../../../domain/pixelPetEnhancements'
import { readCameraPreferences,subscribeCameraPreferences } from './perception/CameraPreferences'
import { updateCameraStatus } from './perception/CameraStatus'
import { validWindowGeometry } from './desktop/WindowAwareness'
import type { WindowGeometryEvent } from './perception/types'

export function isVisiblePixelV2(snapshot:CompanionDesktopSnapshot,rendererActive:boolean) {
  return rendererActive&&snapshot.pixelPetEnabled&&snapshot.desktopVisible&&snapshot.pixelPetStyle==='pixel'&&normalizePixelEnhancements(snapshot.pixelEnhancements).enabled
}
export function usePixelPetPerceptionBridge(snapshot:CompanionDesktopSnapshot) {
  const [rendererActive,setRendererActive]=useState(false),[preferences,setPreferences]=useState(readCameraPreferences)
  const [preferenceRevision,setPreferenceRevision]=useState(0)
  const nativeQueue=useRef(Promise.resolve())
  useEffect(()=>subscribeCameraPreferences(()=>{setPreferences(readCameraPreferences());setPreferenceRevision(value=>value+1)}),[])
  useEffect(()=>{
    if(!isTauri())return
    const subscription=crypto.randomUUID(),channel=new Channel<boolean>();let stopped=false
    channel.onmessage=value=>{if(!stopped)setRendererActive(value===true)}
    void invoke('pixel_pet_activation_subscribe',{subscription,channel}).catch(()=>{if(!stopped)setRendererActive(false)})
    return()=>{stopped=true;void invoke('pixel_pet_activation_unsubscribe',{subscription}).catch(()=>{})}
  },[])
  const visible=isVisiblePixelV2(snapshot,rendererActive),config=normalizePixelEnhancements(snapshot.pixelEnhancements)
  const preferenceKey=JSON.stringify(preferences)
  useEffect(()=>{
    if(!isTauri()||!visible||!preferences.enabled){updateCameraStatus(preferences.enabled?'waiting':'off');return}
    let stopped=false,capture:{stop:()=>void}|undefined
    const chosen=JSON.parse(preferenceKey) as typeof preferences
    void import('./perception/CameraService').then(module=>{
      if(stopped)return
      capture=module.startCamera(chosen,face=>{if(!stopped)void emitTo('companion','companion:pixel-face',face).catch(()=>{})})
    }).catch(()=>{if(!stopped)updateCameraStatus('model-error')})
    return()=>{stopped=true;capture?.stop();void emitTo('companion','companion:pixel-face',null).catch(()=>{})}
  // preferenceKey covers local device, consent and calibration without frame state.
  },[visible,preferenceKey,preferenceRevision,preferences.enabled])
  useEffect(()=>{
    if(!isTauri()||!visible||config.windowMode==='off')return
    let stopped=false
    const channel=new Channel<WindowGeometryEvent>()
    channel.onmessage=value=>{if(!stopped&&validWindowGeometry(value))void emitTo('companion','companion:pixel-window',value).catch(()=>{})}
    // Serialize native starts/stops so rapid settings changes cannot replay an old enable.
    nativeQueue.current=nativeQueue.current.catch(()=>{}).then(async()=>{if(!stopped)await invoke('pixel_desktop_watch',{enabled:true,channel})})
    void nativeQueue.current.catch(()=>{if(!stopped)void emitTo('companion','companion:pixel-window',null).catch(()=>{})})
    return()=>{
      stopped=true;void emitTo('companion','companion:pixel-window',null).catch(()=>{})
      nativeQueue.current=nativeQueue.current.catch(()=>{}).then(()=>invoke<void>('pixel_desktop_watch',{enabled:false,channel}))
      void nativeQueue.current.catch(()=>{})
    }
  },[visible,config.windowMode])
}
