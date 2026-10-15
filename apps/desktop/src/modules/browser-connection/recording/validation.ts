import { browserOrigin } from '../../../domain/browser'
import { cueLabels,type BrowserRecording } from './types'
export function isBrowserRecording(value:unknown):value is BrowserRecording {
  if(!value||typeof value!=='object')return false
  const r=value as BrowserRecording
  try{return /^[a-f0-9]{64}$/u.test(r.id)&&browserOrigin(r.origin)===r.origin&&Number.isSafeInteger(r.tabId)&&r.tabId>=0&&['recording','paused','review'].includes(r.phase)&&Array.isArray(r.events)&&r.events.length<=7&&r.events.every(cue=>Object.hasOwn(cueLabels,cue))&&Number.isSafeInteger(r.remainingSeconds)&&r.remainingSeconds>=0&&r.remainingSeconds<=300&&Object.keys(r).every(key=>['id','origin','tabId','phase','events','remainingSeconds'].includes(key))}catch{return false}
}
