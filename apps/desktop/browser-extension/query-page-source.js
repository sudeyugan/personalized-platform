import { permitted } from './policy.js'
import { inspectLoginForm } from './login-form.js'
// Only RAM leases for one explicitly authorized site's unique current page.
// No history traversal, page values, persisted URLs or activation/navigation.
let epoch,sites=[],enabled=false
const borrowed=new Map()
export function maintainQuerySources(config){
  if(!config||epoch!==config.epoch||JSON.stringify(sites)!==JSON.stringify(config.sites)||enabled!==config.enabled)borrowed.clear()
  epoch=config?.epoch;sites=config?.sites??[];enabled=config?.enabled===true
}
export async function borrowQueryPage(job,assertActive){
  if(job.queryMode!=='background'||!enabled||!sites.includes(job.origin)||!await permitted(job.origin))return []
  const version=epoch,tabs=(await chrome.tabs.query({url:`${job.origin}/*`})).filter(tab=>!tab.incognito&&tab.url&&new URL(tab.url).origin===job.origin)
  if(tabs.length!==1)return []
  const tab=tabs[0];if(tab.status!=='complete'||tab.pendingUrl)return []
  await assertActive(job)
  // A login page needs an isolated workspace, never a click on the user's tab.
  let result
  try{result=await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:false},world:'ISOLATED',func:inspectLoginForm})}catch{return []}
  await assertActive(job)
  const fresh=await chrome.tabs.get(tab.id)
  if(!enabled||epoch!==version||!sites.includes(job.origin)||!await permitted(job.origin)||fresh.incognito||fresh.url!==tab.url||fresh.windowId!==tab.windowId||fresh.pendingUrl||result[0]?.result?.status!=='none')return []
  borrowed.set(job.origin,{id:tab.id,windowId:tab.windowId,url:tab.url,expires:Date.now()+120000,epoch})
  return [fresh]
}
export async function borrowedQueryPage(job){
  const lease=borrowed.get(job.origin)
  if(!lease||lease.id!==job.tabId)return false
  if(!['page','observe'].includes(job.kind)||!enabled||lease.epoch!==epoch||lease.expires<Date.now()||!sites.includes(job.origin)||!await permitted(job.origin))throw new Error('tab_changed')
  const tab=await chrome.tabs.get(lease.id)
  if(tab.incognito||tab.windowId!==lease.windowId||tab.url!==lease.url||tab.pendingUrl)throw new Error('tab_changed')
  return true
}
