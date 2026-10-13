import { useEffect, useState } from 'react'
import { supportsNameWake } from '../../domain/companionIdentity'
import { useLibraryStore } from '../../state/useLibraryStore'

/** Edit the same identity, commit on blur so typing never disables wake. */
export function WakeNameField({name,busy=false}:{name:string;busy?:boolean}) {
  const [draft,setDraft]=useState(name),[note,setNote]=useState('')
  useEffect(()=>setDraft(name),[name])
  const commit=()=>{
    const next=draft.trim()
    if(next===name)return
    if(!supportsNameWake(next)){setNote('唤醒名需2～6个汉字，当前名字尚未修改。');return}
    useLibraryStore.getState().setCompanionProfile({name:next});setNote('伙伴名字已同步，监听会使用新名字。')
  }
  return <label><span>伙伴唤醒名<small>与伙伴名字同步；2～6个汉字，输入后点空白处保存</small></span><input value={draft} disabled={busy} aria-label="伙伴唤醒名" onChange={event=>{setDraft(event.target.value);setNote('')}} onBlur={commit} onKeyDown={event=>{if(event.key==='Enter'&&!event.nativeEvent.isComposing)event.currentTarget.blur()}}/>{note&&<small role="status">{note}</small>}</label>
}
