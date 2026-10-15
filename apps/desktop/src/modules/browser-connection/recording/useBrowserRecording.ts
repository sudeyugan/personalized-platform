import { useCallback,useEffect,useRef,useState } from 'react'
import { useLibraryStore } from '../../../state/useLibraryStore'
import { browserConnectionEnabled } from '../authority'
import { browserNative,configureBrowser,type BrowserSnapshot } from '../native'
import type { BrowserRecording,RecordingTab } from './types'
import { isBrowserRecording } from './validation'
export function useBrowserRecording() {
  const [record,setRecord]=useState<BrowserRecording|null>(null),[tabs,setTabs]=useState<RecordingTab[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const generation=useRef(0),active=useRef<BrowserRecording|null>(null),mounted=useRef(false),working=useRef(false)
  const apply=(value:BrowserRecording|null)=>{active.current=value;setRecord(value)}
  const discardActive=useCallback(()=>{const current=active.current;if(current)void browserNative('browser_bridge_record_control',{recordingId:current.id,action:'cancel'}).catch(()=>undefined)},[])
  const stopLifecycle=useCallback(()=>{mounted.current=false;generation.current++;discardActive()},[discardActive])
  useEffect(()=>{
    mounted.current=true
    const refresh=()=>{if(working.current||!('__TAURI_INTERNALS__' in window))return;const version=generation.current;void browserNative<BrowserRecording|null>('browser_bridge_record_status').then(value=>{if(mounted.current&&version===generation.current){if(value!==null&&!isBrowserRecording(value)){setError('示范状态无法核验，没有读取页面或保存步骤。');return}if(active.current&&!value)setError('示范已停止或权限已变化；未保存步骤已清除。');apply(value)}}).catch(()=>undefined)}
    refresh();const timer=setInterval(refresh,1500)
    return ()=>{clearInterval(timer);stopLifecycle()}
  },[stopLifecycle])
  const run=async(action:()=>Promise<void>)=>{
    if(working.current)return
    working.current=true;setBusy(true);setError('');generation.current++
    try{await action()}catch(reason){if(mounted.current)setError(reason instanceof Error?reason.message:'示范操作未完成')}finally{working.current=false;if(mounted.current)setBusy(false)}
  }
  const findPages=(origin:string)=>run(async()=>{
    if(!browserConnectionEnabled())throw new Error('请先开启并连接浏览器，在两侧授权这个网站。')
    const config=useLibraryStore.getState().data.companion.browser!
    if(!config.sites.includes(origin))throw new Error('请先添加并授权这个网站。')
    const identity=JSON.stringify(config),status=await configureBrowser(true,config.sites,false,config.cachedLoginSites??[],config.interactionSites??[])
    const result=await browserNative<BrowserSnapshot>('browser_bridge_request',{request:{kind:'tabs',origin},expectedEpoch:status.epoch})
    if(!mounted.current)return
    if(!browserConnectionEnabled()||identity!==JSON.stringify(useLibraryStore.getState().data.companion.browser))throw new Error('网站设置已变化，请重新选择。')
    if(result.verified!==true||!Array.isArray(result.data))throw new Error('页面列表无法核验。')
    const pages=result.data as RecordingTab[];setTabs(pages)
    if(!pages.length)throw new Error('请先在已连接的Edge打开目标网站，再获取页面。')
  })
  const begin=(origin:string,tabId:number)=>run(async()=>{
    if(!browserConnectionEnabled()||!tabs.some(tab=>tab.tabId===tabId&&tab.origin===origin))throw new Error('请选择本次已核验的目标页面。')
    const identity=JSON.stringify(useLibraryStore.getState().data.companion.browser)
    const value=await browserNative<BrowserRecording>('browser_bridge_record_begin',{origin,tabId})
    if(!isBrowserRecording(value)||value.origin!==origin||value.tabId!==tabId){void browserNative('browser_bridge_cancel').catch(()=>undefined);throw new Error('录制回执无法核验，已停止本次示范。')}
    if(!browserConnectionEnabled()||identity!==JSON.stringify(useLibraryStore.getState().data.companion.browser)){void browserNative('browser_bridge_record_control',{recordingId:value.id,action:'cancel'}).catch(()=>undefined);throw new Error('网站设置已变化，本次示范已停止。')}
    if(mounted.current)apply(value);else void browserNative('browser_bridge_record_control',{recordingId:value.id,action:'cancel'}).catch(()=>undefined)
  })
  const control=(action:'pause'|'resume'|'stop'|'cancel')=>run(async()=>{
    const current=active.current;if(!current)return
    const value=await browserNative<BrowserRecording|null>('browser_bridge_record_control',{recordingId:current.id,action})
    if(value!==null&&!isBrowserRecording(value))throw new Error('录制控制回执无法核验，请停止读取后重试。')
    if(mounted.current)apply(value)
  })
  return {record,tabs,error,busy,findPages,begin,control,clearPages:()=>setTabs([]),done:()=>apply(null)}
}
