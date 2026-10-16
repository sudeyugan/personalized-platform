import { browserNative } from '../native'
import { configureManagedBrowser } from '../managed/native'
import type { BrowserRecording } from './types'
export async function recordingStatus(managed:boolean){
  if(!managed)return browserNative<BrowserRecording|null>('browser_bridge_record_status')
  const state=await configureManagedBrowser()
  return browserNative<BrowserRecording|null>('managed_browser_record',{command:{action:'status'},expectedEpoch:state.epoch})
}
export async function recordingControl(managed:boolean,recordingId:string,action:'pause'|'resume'|'stop'|'cancel'){
  if(!managed)return browserNative<BrowserRecording|null>('browser_bridge_record_control',{recordingId,action})
  const state=await configureManagedBrowser()
  return browserNative<BrowserRecording|null>('managed_browser_record',{command:{action,recordingId},expectedEpoch:state.epoch})
}
