import { describeElement } from './dom.mjs'
import { interaction } from './policy.mjs'
export async function act(page, observation, raw) {
  const action=interaction(raw)
  if(!observation || observation.value?.loading || observation.value?.loginState&&observation.value.loginState!=='continued' || observation.observationId!==action.observationId || observation.url!==page.url() || Date.now()-observation.created>60000)throw new Error('BROWSER_STALE')
  const ref=observation.refs.get(action.elementId)
  if(!ref)throw new Error('BROWSER_STALE')
  if(ref.scroll){if(action.operation!=='scroll')throw new Error('BROWSER_ARGUMENT');try{await page.mouse.wheel(0,500)}catch{throw new Error('BROWSER_ACTION_UNKNOWN')}return}
  if(ref.frame.url()!==ref.url || !await ref.document.evaluate(node=>node===document.documentElement).catch(()=>false))throw new Error('BROWSER_STALE')
  const live=await ref.handle.evaluate(describeElement).catch(()=>null)
  if(!live || JSON.stringify(live)!==JSON.stringify(ref.info) || live.operation!==action.operation)throw new Error('BROWSER_STALE')
  if(action.operation==='invoke') {
    // Trial dispatch cannot submit. Once real dispatch starts a timeout may
    // still mean the page received the action: never classify that as stale.
    await ref.handle.click({trial:true,timeout:3000}).catch(()=>{throw new Error('BROWSER_ACTION_BLOCKED')})
    if(observation.url!==page.url()||!await ref.document.evaluate(node=>node===document.documentElement).catch(()=>false)||JSON.stringify(await ref.handle.evaluate(describeElement).catch(()=>null))!==JSON.stringify(live))throw new Error('BROWSER_STALE')
    const popup=live.opensTab?page.waitForEvent('popup',{timeout:3000}).catch(()=>null):null
    try{await ref.handle.click({timeout:5000})}catch{throw new Error('BROWSER_ACTION_UNKNOWN')}
    return popup?await popup:undefined
  }
  else if(action.operation==='select') {
    if(!live.options.includes(action.query))throw new Error('BROWSER_ARGUMENT')
    try{
      await ref.handle.selectOption({label:action.query},{timeout:5000})
      if(!await ref.handle.evaluate((node,label)=>Array.from(node.selectedOptions).some(option=>option.textContent.trim()===label),action.query))throw new Error('selection not reflected')
    }catch{throw new Error('BROWSER_ACTION_UNKNOWN')}
  } else {
    try{
      await ref.handle.fill(action.query,{timeout:5000})
      // Compare only the fixed, non-credential filter field to the value just
      // supplied by this task. Return a boolean, never extract field contents.
      if(!await ref.handle.evaluate((node,value)=>node.value===value,action.query))throw new Error('input not reflected')
    }catch{throw new Error('BROWSER_ACTION_UNKNOWN')}
    if(action.operation==='search') {
      const safe=await ref.handle.evaluate(element=>{const form=element.form;return !!form && form.method.toLowerCase()==='get' && new URL(form.action,location.href).origin===location.origin && !form.querySelector('input[type="password"]')})
      // No unknown key handlers/POST submission on ordinary fields.
      if(safe)try{await ref.handle.press('Enter',{timeout:5000})}catch{throw new Error('BROWSER_ACTION_UNKNOWN')}
    }
  }
}
