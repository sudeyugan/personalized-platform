import { availableMonitors,getCurrentWindow } from '@tauri-apps/api/window'
import { isTauri } from '@tauri-apps/api/core'
import { useEffect,useRef } from 'react'
import { petScreenGeometry,type PetScreenGeometry } from './ScreenLook'

export function useScreenLook(active:boolean){
  const geometry=useRef<PetScreenGeometry|null>(null)
  useEffect(()=>{
    geometry.current=null
    if(!active||!isTauri())return
    let disposed=false,busy=false,again=false,timer:ReturnType<typeof setTimeout>|undefined
    const stops:Array<()=>void>=[],window=getCurrentWindow()
    const refresh=async()=>{
      timer=undefined;if(disposed)return
      if(busy){again=true;return}busy=true
      try{
        const [position,size,monitors]=await Promise.all([window.outerPosition(),window.outerSize(),availableMonitors()])
        if(!disposed)geometry.current=petScreenGeometry({position,size},monitors)
      }catch{if(!disposed)geometry.current=null}
      finally{busy=false;if(again&&!disposed){again=false;schedule()}}
    }
    const schedule=()=>{if(!disposed&&!timer)timer=setTimeout(()=>{void refresh()},100)}
    const keep=(off:()=>void)=>{if(disposed)off();else stops.push(off)}
    for(const subscribe of [window.onMoved.bind(window),window.onResized.bind(window),window.onScaleChanged.bind(window)])void subscribe(schedule).then(keep).catch(()=>{})
    void refresh()
    return()=>{disposed=true;clearTimeout(timer);stops.forEach(stop=>stop());geometry.current=null}
  },[active])
  return geometry
}
