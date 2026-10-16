import { useEffect,useRef,useState } from 'react'
import { useLibraryStore } from '../../../state/useLibraryStore'
import { validateOperationDraft } from '../../../domain/operations/method'
import { browserConnectionEnabled } from '../authority'
import { recordingStatus,recordingControl } from './native'
import { recordingDraft } from './method'
import { waitForMethodSave } from './persistence'
import type { BrowserRecording } from './types'
export function RecordingReview({record,goal,onDone,onBusyChange}:{record:BrowserRecording;goal:string;onDone():void;onBusyChange?(busy:boolean):void}) {
  const managed=useRef(useLibraryStore.getState().data.companion.browser?.backend==='managed').current
  const base=recordingDraft(record,goal),[title,setTitle]=useState(base.title),[steps,setSteps]=useState(base.steps.join('\n')),[completion,setCompletion]=useState(base.completion)
  const [reviewed,setReviewed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const saved=useRef<{id:string;revision:number}|undefined>(undefined),pending=useRef<AbortController|undefined>(undefined)
  useEffect(()=>()=>pending.current?.abort(),[])
  const save=async()=>{
    if(!reviewed||busy)return
    setBusy(true);onBusyChange?.(true);setError('')
    try{
      if(/名称未保存|请补充操作目的/u.test(steps))throw new Error('请先补充未知控件的操作目的，或移除这一步。没有保存网页原文。')
      const current=await recordingStatus(managed)
      if(!current||current.id!==record.id||current.phase!=='review'||!browserConnectionEnabled()||!useLibraryStore.getState().data.companion.browser?.sites.includes(record.origin))throw new Error('示范或网站授权已变化，请重新开始；未保存方法。')
      const draft=validateOperationDraft({...base,title,steps:steps.split('\n').map(value=>value.trim()).filter(Boolean),completion})
      const method=useLibraryStore.getState().saveOperation(draft,saved.current?.id,saved.current?.revision)
      saved.current={id:method.id,revision:method.revision};pending.current=new AbortController()
      await waitForMethodSave(method.id,method.revision,pending.current.signal)
      try{await recordingControl(managed,record.id,'cancel')}catch(reason){const live=await recordingStatus(managed);if(live?.id===record.id)throw reason}
      onDone()
    }catch(reason){setError(reason instanceof Error?reason.message:'方法保存未完成，预览保留。')}finally{setBusy(false);onBusyChange?.(false)}
  }
  return <form className="browser-record-review" onSubmit={event=>{event.preventDefault();void save()}}>
    <label>方法名称<input required maxLength={80} value={title} disabled={busy} onChange={event=>{setTitle(event.target.value);setReviewed(false)}}/></label>
    <label>示范步骤<textarea rows={5} required value={steps} maxLength={8000} disabled={busy} onChange={event=>{setSteps(event.target.value);setReviewed(false)}}/></label>
    <label>怎样算完成<textarea rows={3} required maxLength={1500} value={completion} disabled={busy} onChange={event=>{setCompletion(event.target.value);setReviewed(false)}}/></label>
    <p className="browser-note">只保存这份步骤说明，不保存网页原文。未知控件请补充目的；之后复现会重新观察，不重放坐标或旧引用。方法随资料备份；你要求小鱼复现时，它可能交给当前配置的模型。</p>
    <label className="browser-record-consent"><input type="checkbox" checked={reviewed} disabled={busy} onChange={event=>setReviewed(event.target.checked)}/>我已核对步骤和隐私内容，确认保存到本机方法册</label>
    {error&&<p role="alert">{error}</p>}
    <button type="submit" disabled={!reviewed||busy}>{busy?'正在确认保存…':'确认保存方法'}</button>
  </form>
}
