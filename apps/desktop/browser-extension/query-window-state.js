// Session-only ownership proof. No account, credentials, page title/body/URL
// or native browser profile path is stored. IDs alone are not ownership.
const key='queryWindow'
const tabId=value=>Number.isSafeInteger(value)&&value>=0
export const markerUrl=owner=>`${chrome.runtime.getURL('query-host.html')}#${owner}`
export async function loadQueryWindow(){
  const value=(await chrome.storage.session.get(key))[key]
  if(!value)return
  if(Object.keys(value).some(k=>!['windowId','markerId','owner','mode','epoch','usedAt','pages'].includes(k))||!tabId(value.windowId)||!tabId(value.markerId)||!/^[a-f0-9-]{36}$/.test(value.owner)||!['background','foreground'].includes(value.mode)||!Number.isSafeInteger(value.epoch)||value.epoch<0||!Number.isFinite(value.usedAt)||!Array.isArray(value.pages)||value.pages.length>32||value.pages.some(p=>!p||Object.keys(p).some(k=>!['tabId','origin'].includes(k))||!tabId(p.tabId)||typeof p.origin!=='string')){await forgetQueryWindow();return}
  return value
}
export async function saveQueryWindow(value){await chrome.storage.session.set({[key]:value})}
export async function forgetQueryWindow(){await chrome.storage.session.remove(key)}
export async function queryWindowProof(value){
  try{
    const [window,marker]=await Promise.all([chrome.windows.get(value.windowId),chrome.tabs.get(value.markerId)])
    const expected=markerUrl(value.owner),matches=marker.url===expected||marker.pendingUrl===expected&&(!marker.url||['about:blank','chrome://newtab/','edge://newtab/'].includes(marker.url))
    if(window.id!==value.windowId||window.incognito||marker.incognito||marker.windowId!==value.windowId||!matches)return
    const tabs=await chrome.tabs.query({windowId:value.windowId}),ids=new Set([value.markerId,...value.pages.map(p=>p.tabId)])
    if(tabs.some(tab=>!ids.has(tab.id)))return
    return window
  }catch{return}
}
export async function ownership(value){
  const window=await queryWindowProof(value)
  // State is an adoption check only AFTER initialization, not proof of who
  // created a window. An OS-delayed minimize must not invalidate a new lease.
  if(window&&!(value.mode==='background'&&(window.focused||window.state!=='minimized')))return window
}
export async function discardOwnedWindow(value){
  // Only a still-minimized owned window may be removed automatically.
  const window=await ownership(value)
  if(window&&!window.focused&&window.state==='minimized')await chrome.windows.remove(value.windowId).catch(()=>undefined)
  const current=await loadQueryWindow();if(current?.owner===value.owner)await forgetQueryWindow()
}
