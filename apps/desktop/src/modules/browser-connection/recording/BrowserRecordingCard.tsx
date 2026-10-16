import { useState } from 'react'
import { useLibraryStore } from '../../../state/useLibraryStore'
import { cueLabels } from './types'
import { useBrowserRecording } from './useBrowserRecording'
import { RecordingReview } from './RecordingReview'
import './recording.css'
const emptySites:string[]=[]
export function BrowserRecordingCard() {
  const managed=useLibraryStore(state=>state.data.companion.browser?.backend==='managed')
  const sites=useLibraryStore(state=>state.data.companion.browser?.sites??emptySites),[origin,setOrigin]=useState(''),[goal,setGoal]=useState(''),[tabId,setTabId]=useState('')
  const [notice,setNotice]=useState(''),[saving,setSaving]=useState(false)
  const demo=useBrowserRecording(),record=demo.record
  return <details className="browser-recording"><summary><span>教小鱼做一次</span><small>{record?.phase==='recording'?'正在示范':record?.phase==='paused'?'示范已暂停':record?'待整理步骤':'非视觉 · 只记操作步骤'}</small></summary><div className="browser-recording-body">
    {!record?<>
      <p className="browser-note">你操作已授权网页，小鱼记下步骤。只在本机整理，不录屏、不记密码、输入内容或网页正文；未知控件名称不保存，之后由你补充。</p>
      <label>想教小鱼做什么<input maxLength={80} value={goal} onChange={event=>setGoal(event.target.value)} placeholder="例如：查看邮箱未读、查看学校通知"/></label>
      <div className="browser-record-target"><label>网站<select value={origin} disabled={demo.busy} onChange={event=>{setOrigin(event.target.value);setTabId('');demo.clearPages()}}><option value="">选择已添加的网站</option>{sites.map(site=><option key={site} value={site}>{new URL(site).hostname}</option>)}</select></label>{!managed&&<button type="button" disabled={!origin||demo.busy} onClick={()=>void demo.findPages(origin)}>获取页面</button>}</div>
      {demo.tabs.length>0&&<label>目标页面<select value={tabId} disabled={demo.busy} onChange={event=>setTabId(event.target.value)}><option value="">请选择本次示范页面</option>{demo.tabs.map(tab=><option key={tab.tabId} value={tab.tabId}>{tab.title||tab.url}</option>)}</select><small>页面名称仅用于当前选择，不保存到示范。</small></label>}
      {managed&&<p className="browser-note">开始后才打开专用示范窗口，不影响日常Edge。仅示范时显示窗口；小鱼不会同时执行查询。</p>}
      <button type="button" disabled={!goal.trim()||!origin||!managed&&!tabId||demo.busy} onClick={()=>{setNotice('');void demo.begin(origin,Number(tabId))}}>开始这次示范</button>
    </>:<>
      <div className="browser-record-status"><span className={record.phase==='recording'?'browser-record-dot active':'browser-record-dot'}/><strong>{record.phase==='recording'?'正在示范':record.phase==='paused'?'已暂停':'步骤已收好，等待你核对'}</strong><small>{record.events.length}/7 步 · {Math.ceil(record.remainingSeconds/60)} 分钟剩余</small></div>
      <p className="browser-note">{new URL(record.origin).hostname} · 仅这个页面。请等{managed?'专用窗口':'Edge'}右下角出现「正在示范」再操作。最长5分钟、7个事件加入口一步；达到上限自动停止。离开此设置页、取消或撤销权限会丢弃未保存示范。{managed?'保存或丢弃后关闭示范窗口，普通查询仍在后台。':''}</p>
      {record.phase!=='review'&&<ol className="browser-record-events">{record.events.map((cue,index)=><li key={`${index}-${cue}`}>{cueLabels[cue]}</li>)}</ol>}
      <div className="browser-actions">{record.phase!=='review'&&<><button type="button" disabled={demo.busy} onClick={()=>void demo.control(record.phase==='paused'?'resume':'pause')}>{record.phase==='paused'?'继续示范':'暂停'}</button><button type="button" disabled={demo.busy} onClick={()=>void demo.control('stop')}>停止并整理</button></>}<button type="button" disabled={demo.busy||saving} onClick={()=>void demo.control('cancel')}>丢弃这次示范</button></div>
      {record.phase==='review'&&<RecordingReview key={record.id} record={record} goal={goal||'示范网页查询'} onBusyChange={setSaving} onDone={()=>{demo.done();setNotice('方法已保存到本机方法册；未自动执行。')}}/>}
    </>}
    {demo.error&&<p role="alert">{demo.error}</p>}
    {notice&&<p role="status">{notice}</p>}
  </div></details>
}
