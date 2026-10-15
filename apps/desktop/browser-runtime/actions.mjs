import { describeElement } from './dom.mjs'
import { interaction } from './policy.mjs'
export async function act(page, observation, raw) {
  const action=interaction(raw)
  if(!observation || observation.value?.loading || observation.value?.loginState || observation.observationId!==action.observationId || observation.url!==page.url() || Date.now()-observation.created>60000)throw new Error('BROWSER_STALE')
  const ref=observation.refs.get(action.elementId)
  if(!ref)throw new Error('BROWSER_STALE')
  if(ref.scroll){if(action.operation!=='scroll')throw new Error('BROWSER_ARGUMENT');await page.mouse.wheel(0,500);return}
  if(ref.frame.url()!==ref.url || !await ref.document.evaluate(node=>node===document.documentElement).catch(()=>false))throw new Error('BROWSER_STALE')
  const live=await ref.handle.evaluate(describeElement)
  if(!live || JSON.stringify(live)!==JSON.stringify(ref.info) || live.operation!==action.operation)throw new Error('BROWSER_STALE')
  if(action.operation==='invoke')await ref.handle.click({timeout:5000})
  else if(action.operation==='select') {
    if(!live.options.includes(action.query))throw new Error('BROWSER_ARGUMENT')
    await ref.handle.selectOption({label:action.query},{timeout:5000})
  } else {
    await ref.handle.fill(action.query,{timeout:5000})
    if(action.operation==='search') {
      const safe=await ref.handle.evaluate(element=>{const form=element.form;return !!form && form.method.toLowerCase()==='get' && new URL(form.action,location.href).origin===location.origin && !form.querySelector('input[type="password"]')})
      // No unknown key handlers/POST submission on ordinary fields.
      if(safe)await ref.handle.press('Enter',{timeout:5000})
    }
  }
}
