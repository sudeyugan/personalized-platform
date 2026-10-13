import { authorisedSites, bridgeCall, siteOrigin } from './policy.js'

let request, code, busy=false,terminal=false
const confirm=document.getElementById('confirmSetup'),cancel=document.getElementById('cancelSetup'),status=document.getElementById('setupStatus')
const wake=()=>chrome.runtime.sendMessage({type:'wake'}).catch(()=>undefined)
async function clearPending(id) { const {pendingSetup}=await chrome.storage.local.get('pendingSetup');if(pendingSetup?.id===id)await chrome.storage.local.set({pendingSetup:null}) }
async function render() {
  if(busy||terminal)return
  confirm.disabled=true;cancel.disabled=true;request=undefined
  const {connectionCode,pendingSetup,browserConfig}=await chrome.storage.local.get(['connectionCode','pendingSetup','browserConfig'])
  const list=document.getElementById('setupSites');list.replaceChildren()
  if(!connectionCode||!pendingSetup||!browserConfig?.enabled||pendingSetup.epoch!==browserConfig.epoch||pendingSetup.expiresAt<=Date.now()) {status.textContent='暂无待确认的网站。请在一隅添加网站或点击连接。';return}
  try {
    const fresh=await bridgeCall('/setup',{id:pendingSetup.id,action:'inspect'},connectionCode)
    if(fresh.id!==pendingSetup.id||fresh.epoch!==browserConfig.epoch||!Array.isArray(fresh.sites)||!fresh.sites.length||fresh.sites.some(site=>siteOrigin(site)!==site||!browserConfig.sites.includes(site))||fresh.openOrigin!=null&&!fresh.sites.includes(fresh.openOrigin))throw new Error('设置请求已变化')
    request=fresh;code=connectionCode
    for(const site of fresh.sites){const row=document.createElement('p');row.textContent=new URL(site).hostname;list.append(row)}
    confirm.textContent=fresh.openOrigin?'授权并打开网站':'确认Edge授权'
    status.textContent=fresh.openOrigin?`确认后打开 ${new URL(fresh.openOrigin).hostname}；本次不会自动读取网页。`:'只授权列出的网站；本次不会自动读取网页。'
    confirm.disabled=false;cancel.disabled=false
  }catch{status.textContent='本次连接已停止、过期或改变。请从一隅重新连接网站。'}
}
confirm.addEventListener('click',async()=>{
  if(!request||busy)return
  const current=request;busy=true;confirm.disabled=true;cancel.disabled=true
  try {
    // Must be the first async API: a native application click is not an
    // extension user gesture. Do not move this behind a fetch/storage await.
    const granted=await chrome.permissions.request({origins:current.sites.map(site=>`${site}/*`)})
    if(!granted){await bridgeCall('/setup',{id:current.id,action:'cancel'},code).catch(()=>undefined);status.textContent='已取消授权。网站保留在一隅，可在那里重试。';return}
    let completed
    try{
      completed=await bridgeCall('/setup',{id:current.id,action:'complete',sites:await authorisedSites()},code)
      if(completed.completed!==true||completed.openOrigin!==current.openOrigin)throw new Error('设置回执无效')
    }catch{
      // Fail closed if confirmation finishes after cancel/revoke/expiry or
      // disconnect. Never open the website from a stale request.
      await chrome.permissions.remove({origins:current.sites.map(site=>`${site}/*`)})
      await bridgeCall('/setup',{id:current.id,action:'cancel'},code).catch(()=>undefined)
      status.textContent='本次确认已失效，已释放本次网站权限。请从一隅重新连接。'
      return
    }
    try{if(completed.openOrigin)await chrome.tabs.create({url:siteOrigin(completed.openOrigin)});status.textContent='网站已连接。可以回到一隅提问。'}catch{status.textContent='网站已连接，但页面未能打开。请在Edge手动打开目标页面。'}
  }catch{await bridgeCall('/setup',{id:current.id,action:'cancel'},code).catch(()=>undefined);status.textContent='Edge授权未完成，请从一隅重试。'}
  finally{request=undefined;terminal=true;await clearPending(current.id);busy=false;await wake()}
})
cancel.addEventListener('click',async()=>{if(!request||busy)return;const id=request.id;busy=true;confirm.disabled=true;cancel.disabled=true;await bridgeCall('/setup',{id,action:'cancel'},code).catch(()=>undefined);terminal=true;await clearPending(id);request=undefined;busy=false;status.textContent='已取消本次连接。';await wake()})
chrome.storage.onChanged.addListener(changes=>{if(changes.pendingSetup||changes.browserConfig)void render()})
void render()
