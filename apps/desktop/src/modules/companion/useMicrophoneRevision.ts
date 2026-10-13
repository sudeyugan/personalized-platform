import { listen } from '@tauri-apps/api/event'
import { useEffect, useState } from 'react'

/** Restart the existing lease on settings changes, never open another mic. */
export function useMicrophoneRevision() {
  const [revision,setRevision]=useState(0)
  useEffect(()=>{
    let disposed=false,off:(()=>void)|undefined,timer:number|undefined
    const changed=()=>{window.clearTimeout(timer);timer=window.setTimeout(()=>{if(!disposed)setRevision(value=>value+1)},180)}
    const stored=(event:StorageEvent)=>{if(event.key==='yiyu:microphone-preferences')changed()}
    window.addEventListener('yiyu:microphone-changed',changed);window.addEventListener('storage',stored)
    if('__TAURI_INTERNALS__' in window)void listen('companion:microphone-changed',changed).then(stop=>{if(disposed)stop();else off=stop}).catch(()=>undefined)
    return()=>{disposed=true;window.clearTimeout(timer);off?.();window.removeEventListener('yiyu:microphone-changed',changed);window.removeEventListener('storage',stored)}
  },[])
  return revision
}
