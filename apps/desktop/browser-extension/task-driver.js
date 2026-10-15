import { permitted,publicUrl } from './policy.js'
import { observeControls,actOnControl } from './controls.js'
import { prepareQueryPage,assertQueryTab } from './query-window.js'
export async function checkTaskTab(job){
  if(job.queryMode)await assertQueryTab(job)
  if(!await permitted(job.origin))throw new Error('permission')
  const tab=await chrome.tabs.get(job.tabId)
  if(tab.incognito||!tab.url||new URL(tab.url).origin!==job.origin||tab.pendingUrl&&new URL(tab.pendingUrl).origin!==job.origin)throw new Error('tab_changed')
  return tab
}
export async function ensureTaskPage(job,assertActive){
  const url=new URL(job.targetUrl??job.origin)
  if(url.origin!==job.origin||url.protocol!=='https:'||url.search||url.hash||url.username||url.password||url.port)throw new Error('failed')
  if(!await permitted(job.origin))throw new Error('permission')
  if(job.queryMode){
    const tabs=await prepareQueryPage(job,assertActive),tab=tabs[0]
    if(!tab||!Number.isSafeInteger(tab.id))throw new Error('page_open')
    const prepared={...job,tabId:tab.id}
    await waitTaskPage(prepared,assertActive,true)
    const current=await checkTaskTab(prepared)
    return [{tabId:current.id,origin:job.origin,title:(current.title??'').slice(0,200),url:publicUrl(current.url)}]
  }
  let tabs=(await chrome.tabs.query({url:`${job.origin}/*`})).filter(tab=>!tab.incognito&&tab.url&&new URL(tab.url).origin===job.origin)
  if(!tabs.length){
    await assertActive(job);if(!await permitted(job.origin))throw new Error('permission')
    let created
    try{created=await chrome.tabs.create({url:url.href,active:true})}catch{throw new Error('page_open')}
    // create() acknowledges a tab, not a committed document. Never return its
    // about:blank/chrome://newtab URL as though it were the authorized page.
    if(!Number.isSafeInteger(created?.id)||created.id<0)throw new Error('page_open')
    const prepared={...job,tabId:created.id}
    await waitTaskPage(prepared,assertActive,true)
    tabs=[await checkTaskTab(prepared)]
  }
  if(!await permitted(job.origin))throw new Error('permission')
  return tabs.slice(0,20).map(tab=>({tabId:tab.id,origin:job.origin,title:(tab.title??'').slice(0,200),url:publicUrl(tab.url??url.href)}))
}
export async function waitTaskPage(job,assertActive,createdHere=false){
  for(let attempt=0;attempt<16;attempt++){
    if(assertActive)await assertActive(job)
    if(!await permitted(job.origin))throw new Error('permission')
    let tab
    try{tab=await chrome.tabs.get(job.tabId)}catch{throw new Error('tab_changed')}
    if(tab.incognito||tab.pendingUrl&&new URL(tab.pendingUrl).origin!==job.origin)throw new Error('tab_changed')
    const committed=tab.url&&new URL(tab.url).origin===job.origin
    if(!committed&&!(createdHere&&(!tab.url||['about:blank','chrome://newtab/','edge://newtab/'].includes(tab.url))))throw new Error('tab_changed')
    if(committed&&tab.status!=='loading'&&!tab.pendingUrl)return
    await new Promise(resolve=>setTimeout(resolve,500))
  }
  throw new Error('page_pending')
}
export async function taskControls(job){
  const before=await checkTaskTab(job)
  let result
  try{result=await chrome.scripting.executeScript({target:{tabId:job.tabId,allFrames:false},world:'ISOLATED',func:observeControls})}catch{throw new Error('page_access')}
  if((await checkTaskTab(job)).url!==before.url)throw new Error('tab_changed')
  return result[0]?.result
}
export async function performTaskAction(job,assertActive){
  const before=await checkTaskTab(job)
  await assertActive(job)
  if((await checkTaskTab(job)).url!==before.url)throw new Error('tab_changed')
  const result=await chrome.scripting.executeScript({target:{tabId:job.tabId,allFrames:false},world:'ISOLATED',func:actOnControl,args:[job.interaction]})
  await checkTaskTab(job)
  return {tabId:job.tabId,origin:job.origin,...result[0]?.result}
}
