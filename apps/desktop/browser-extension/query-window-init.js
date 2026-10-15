import { queryWindowProof,ownership,loadQueryWindow,forgetQueryWindow } from './query-window-state.js'
const settle=()=>new Promise(resolve=>setTimeout(resolve,50))
// Used ONLY with IDs just returned by windows.create, before publishing a
// reusable lease. Never called to re-minimize an existing/adopted window.
export async function initializeQueryWindow(value,check){
  let window
  for(let attempt=0;attempt<20;attempt++){
    await check();window=await queryWindowProof(value)
    if(window)break
    await settle()
  }
  if(!window)throw new Error('page_open')
  if(value.mode==='background'&&(window.state!=='minimized'||window.focused)){
    // Some native window managers apply create(state) late or ignore it.
    // One explicit update, still before any website page/read/act is created.
    await check();if(!await queryWindowProof(value))throw new Error('page_open')
    try{await chrome.windows.update(value.windowId,{state:'minimized'})}catch{throw new Error('page_open')}
  }
  for(let attempt=0;attempt<20;attempt++){
    await check();if(await ownership(value))return
    if(!await queryWindowProof(value))throw new Error('page_open')
    await settle()
  }
  throw new Error('page_open')
}
export async function discardFreshQueryWindow(value){
  // Failed initialization has no user work: require the unique marker AND
  // the exact sole marker tab, never close an adopted/reusable window here.
  if(value.pages.length)return
  for(let attempt=0;attempt<20;attempt++){
    if(await queryWindowProof(value)){
      await chrome.windows.remove(value.windowId).catch(()=>undefined);break
    }
    await settle()
  }
  if((await loadQueryWindow())?.owner===value.owner)await forgetQueryWindow()
}
