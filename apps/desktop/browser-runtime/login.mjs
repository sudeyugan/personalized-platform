import { inspectLogin } from './login-dom.mjs'
import { protectLoginRedirects } from './login-redirects.mjs'

// One attempt per site in this owned context, including ambiguous dispatch.
// Re-observation/replanning must not turn into repeated authentication POSTs.
export async function continueLogin(page,site,allowed,attempts) {
  const url=page.url()
  const check=()=>{if(page.isClosed()||page.url()!==url||new URL(page.url()).origin!==site)throw new Error('BROWSER_TAB_CHANGED')}
  let inspected=await page.evaluateHandle(inspectLogin),button
  const status=handle=>handle.evaluate(value=>value.status)
  try{
    let current=await status(inspected)
    if(current==='none')return
    if(!allowed)return 'managed_login'
    if(attempts.has(site))return 'managed_pending'
    for(let index=0;current==='unfilled'&&index<6;index++){
      await new Promise(resolve=>setTimeout(resolve,250));check();await inspected.dispose()
      inspected=await page.evaluateHandle(inspectLogin);current=await status(inspected)
    }
    if(current==='none')return
    if(current!=='ready')return current==='unfilled'?'managed_unfilled':'managed_needs_user'
    try{await protectLoginRedirects(page,site)}catch{return 'managed_needs_user'}
    // Recheck document, form policy and exact button identity immediately before
    // Playwright's trusted click. No model script/selectors/credentials involved.
    button=(await inspected.getProperty('button')).asElement()
    if(!button)return 'managed_needs_user'
    check()
    const fresh=await page.evaluateHandle(inspectLogin)
    try{
      if(await status(fresh)!=='ready'||!await fresh.evaluate((value,button)=>value.button===button,button))return 'managed_needs_user'
    }finally{await fresh.dispose()}
    attempts.add(site)
    try{await button.click({timeout:3000})}catch{return 'managed_pending'}
    // This is only a continuation hint, never proof of account/query success.
    // The caller must still obtain a new observation and business evidence.
    for(let index=0;index<16;index++){
      await new Promise(resolve=>setTimeout(resolve,250))
      if(page.isClosed()||new URL(page.url()).origin!==site)return 'managed_needs_user'
      try{
        const after=await page.evaluate(inspectLogin)
        if(after.status==='none')return 'continued'
        if(after.status==='needs_user')return 'managed_needs_user'
      }catch{/* navigation may replace the execution context; never click again */}
    }
    return 'managed_pending'
  }finally{await button?.dispose().catch(()=>{});await inspected.dispose().catch(()=>{})}
}
