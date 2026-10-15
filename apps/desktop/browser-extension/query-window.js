import { permitted,siteOrigin,publicUrl } from './policy.js'
import { markerUrl,loadQueryWindow,saveQueryWindow,forgetQueryWindow,ownership,discardOwnedWindow } from './query-window-state.js'
import { initializeQueryWindow,discardFreshQueryWindow } from './query-window-init.js'
import { maintainQuerySources,borrowQueryPage,borrowedQueryPage } from './query-page-source.js'
let scope,generation=0,serial=Promise.resolve()
const locked=fn=>{const next=serial.catch(()=>undefined).then(fn);serial=next.catch(()=>undefined);return next}
export async function maintainQueryWindow(config,hasJob=false){
  maintainQuerySources(config)
  const changed=scope&&(!config||scope.epoch!==config.epoch||scope.enabled!==config.enabled||JSON.stringify(scope.sites)!==JSON.stringify(config.sites))
  scope=config?{epoch:config.epoch,enabled:config.enabled,sites:config.sites}:undefined
  if(changed||!config)generation++
  return locked(async()=>{
    const value=await loadQueryWindow();if(!value)return
    if(!scope?.enabled||value.epoch!==scope.epoch||value.pages.some(p=>!scope.sites.includes(p.origin))||!hasJob&&Date.now()-value.usedAt>300000){await discardOwnedWindow(value);return}
    if(!await ownership(value))await forgetQueryWindow()
  })
}
async function checked(job,assertActive,version){
  if(version!==generation||!scope?.enabled||!scope.sites.includes(job.origin)||!await permitted(job.origin))throw new Error('permission')
  await assertActive(job)
  if(version!==generation)throw new Error('permission')
}
async function current(mode){
  const value=await loadQueryWindow()
  if(!value)return
  if(value.epoch!==scope?.epoch||value.mode!==mode){await discardOwnedWindow(value);return}
  if(!await ownership(value)){await forgetQueryWindow();return}
  return value
}
export async function queryTabs(job,assertActive){
  if(!scope?.enabled||!scope.sites.includes(job.origin)||!await permitted(job.origin))throw new Error('permission')
  const value=await current(job.queryMode);if(!value)return assertActive?borrowQueryPage(job,assertActive):[]
  const tabs=[]
  for(const page of value.pages.filter(p=>p.origin===job.origin)){
    try{const tab=await chrome.tabs.get(page.tabId);if(!tab.incognito&&tab.windowId===value.windowId&&tab.url&&new URL(tab.url).origin===job.origin&&(!tab.pendingUrl||new URL(tab.pendingUrl).origin===job.origin))tabs.push(tab)}catch{/* closed page */}
  }
  value.usedAt=Date.now();await saveQueryWindow(value);return tabs
}
export async function assertQueryTab(job){
  if(await borrowedQueryPage(job))return {borrowed:true}
  if(!(await queryTabs(job)).some(tab=>tab.id===job.tabId))throw new Error('tab_changed')
  return {borrowed:false}
}
export async function prepareQueryPage(job,assertActive){
  return locked(async()=>{
    const version=generation;await checked(job,assertActive,version)
    let value=await current(job.queryMode),createdWindow=false,initialized=false,createdTab
    try{
      if(!value){
        const owner=crypto.randomUUID(),created=await chrome.windows.create({url:markerUrl(owner),type:'normal',incognito:false,focused:job.queryMode==='foreground',state:job.queryMode==='foreground'?'normal':'minimized'})
        if(!Number.isSafeInteger(created?.id)||!Number.isSafeInteger(created.tabs?.[0]?.id))throw new Error('page_open')
        value={windowId:created.id,markerId:created.tabs[0].id,owner,mode:job.queryMode,epoch:scope?.epoch??-1,pages:[],usedAt:Date.now()};createdWindow=true
        // A late create still gets verified and cleaned up, never orphaned.
        await initializeQueryWindow(value,()=>checked(job,assertActive,version))
        initialized=true;await checked(job,assertActive,version);await saveQueryWindow(value)
      }
      const existing=await queryTabs(job)
      if(existing.length)return existing
      for(const old of value.pages.filter(page=>page.origin===job.origin)){
        const tab=await chrome.tabs.get(old.tabId).catch(()=>undefined)
        if(tab?.windowId===value.windowId&&await ownership(value))await chrome.tabs.remove(old.tabId).catch(()=>undefined)
      }
      value.pages=value.pages.filter(page=>page.origin!==job.origin)
      await saveQueryWindow(value)
      let entry=job.targetUrl??job.origin
      if(!job.targetUrl||job.targetUrl===job.origin||job.targetUrl===job.origin+'/'){
        const candidates=(await chrome.tabs.query({url:`${job.origin}/*`})).filter(tab=>tab.windowId!==value.windowId&&!tab.incognito&&tab.url)
        const safe=[...new Set(candidates.flatMap(tab=>{try{const url=new URL(tab.url);if(url.origin!==job.origin||url.search||url.hash||url.username||url.password)return [];siteOrigin(url.origin);return [publicUrl(url.href)]}catch{return []}}))]
        if(safe.length===1)entry=safe[0]
      }
      await checked(job,assertActive,version)
      if(!await ownership(value))throw new Error('tab_changed')
      createdTab=await chrome.tabs.create({windowId:value.windowId,url:entry,active:job.queryMode==='foreground'})
      if(!Number.isSafeInteger(createdTab?.id))throw new Error('page_open')
      // Register only the tab just returned, before any read/act is allowed.
      value.pages.push({tabId:createdTab.id,origin:job.origin});value.usedAt=Date.now();await saveQueryWindow(value)
      await checked(job,assertActive,version)
      if(!await ownership(value))throw new Error('tab_changed')
      return [createdTab]
    }catch(error){
      if(value&&createdWindow){if(initialized)await discardOwnedWindow(value);else await discardFreshQueryWindow(value)}
      else if(value&&createdTab?.id&&await ownership(value)){
        await chrome.tabs.remove(createdTab.id).catch(()=>undefined);value.pages=value.pages.filter(p=>p.tabId!==createdTab.id)
        if(version===generation)await saveQueryWindow(value)
      }
      throw error
    }
  })
}
