import { afterEach,beforeEach,expect,it,vi } from 'vitest'
import { clickTrustedLogin,hasTrustedLoginClick,registerTrustedLoginBridge } from './trusted-login.js'
import { TRUSTED_HELPER_ID } from './trusted-helper-id.js'
import { TRUSTED_HELPER_REVISION } from './trusted-helper-revision.js'
const origin='https://mail.example.com',url=`${origin}/login`,job={origin,tabId:7,cachedLogin:true}
let api,listener,store,active,lastCap
const callback=(message,sender={id:TRUSTED_HELPER_ID})=>new Promise(resolve=>{const accepted=listener(message,sender,resolve);if(!accepted)resolve(undefined)})
beforeEach(()=>{
  store={trustedLoginEnabled:true,sites:[origin]};active=vi.fn(async()=>{});lastCap=undefined
  api={runtime:{onMessageExternal:{addListener:fn=>{listener=fn}},sendMessage:vi.fn(async(_,message)=>{
    if(message.type==='status')return {installed:true,connected:true,revision:TRUSTED_HELPER_REVISION}
    if(message.type==='login'){lastCap=message.cap;for(const mode of ['assert','target','validate_target','validate_target']){if(!(await callback({type:'trusted_login_validate',cap:message.cap,mode})).active)return {error:'permission'}}return {status:'submitted'}}
  })},storage:{local:{get:vi.fn(async()=>store),set:vi.fn(async value=>Object.assign(store,value)),remove:vi.fn(async key=>delete store[key])}},permissions:{contains:vi.fn(async()=>true)},tabs:{get:vi.fn(async()=>({url,incognito:false}))},scripting:{executeScript:vi.fn(async()=>[{result:{status:'ready',point:{x:12,y:24}}}])}}
  vi.stubGlobal('chrome',api);registerTrustedLoginBridge()
})
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers()})
it('uses a scoped RAM lease and ordered callbacks, no debugger in reader',async()=>{
  expect(await clickTrustedLogin(job,url,active)).toBe('submitted')
  expect(api.debugger).toBeUndefined()
  expect(api.scripting.executeScript.mock.calls.map(([r])=>r.args[0])).toEqual(['target','validate_target','validate_target'])
  expect(await callback({type:'trusted_login_validate',cap:lastCap,mode:'assert'})).toEqual({active:false})
  expect(api.runtime.sendMessage).toHaveBeenLastCalledWith(TRUSTED_HELPER_ID,{type:'stop',cap:lastCap})
})
it('requires task opt in, connected helper and local switch',async()=>{
  await expect(clickTrustedLogin({...job,cachedLogin:false},url,active)).rejects.toThrow('permission')
  store.trustedLoginEnabled=false;expect(await hasTrustedLoginClick()).toBe(false)
  await expect(clickTrustedLogin(job,url,active)).rejects.toThrow('permission')
  expect(api.scripting.executeScript).not.toHaveBeenCalled()
})
it('rejects non-helper callers, missing capabilities and out-of-order callbacks',async()=>{
  expect(await callback({type:'trusted_login_validate',cap:'guess',mode:'assert'},{id:'other'})).toBeUndefined()
  api.runtime.sendMessage.mockImplementation(async(_,message)=>{
    if(message.type==='status')return {installed:true,connected:true,revision:TRUSTED_HELPER_REVISION}
    if(message.type==='login'){expect(await callback({type:'trusted_login_validate',cap:message.cap,mode:'target'})).toEqual({active:false});return {status:'submitted'}}
  })
  await expect(clickTrustedLogin(job,url,active)).rejects.toThrow('tab_changed')
})
it.each(['permission','active','url','incognito'])('rechecks %s on each callback',async kind=>{
  api.scripting.executeScript.mockImplementationOnce(async()=>{
    if(kind==='permission')api.permissions.contains.mockResolvedValue(false)
    if(kind==='active')active.mockRejectedValue(new Error('permission'))
    if(kind==='url')api.tabs.get.mockResolvedValue({url:`${origin}/other`})
    if(kind==='incognito')api.tabs.get.mockResolvedValue({url,incognito:true})
    return [{result:{status:'ready',point:{x:12,y:24}}}]
  })
  await expect(clickTrustedLogin(job,url,active)).rejects.toThrow('permission')
  expect(api.scripting.executeScript).toHaveBeenCalledOnce()
})
it('consumes an explicit pending pairing nonce once, rejects expired requests',async()=>{
  expect(await callback({type:'trusted_login_pair',nonce:'missing'})).toEqual({accepted:false})
  store.trustedLoginPending={nonce:'fixture',expires:Date.now()+1000}
  expect(await callback({type:'trusted_login_pair',nonce:'fixture'})).toEqual({accepted:true})
  expect(await callback({type:'trusted_login_pair',nonce:'fixture'})).toEqual({accepted:false})
  store.trustedLoginPending={nonce:'expired',expires:Date.now()-1}
  expect(await callback({type:'trusted_login_pair',nonce:'expired'})).toEqual({accepted:false})
})
it('expires a hung helper and clears the capability',async()=>{
  vi.useFakeTimers();api.runtime.sendMessage.mockImplementation(async(_,m)=>m.type==='status'?{installed:true,connected:true,revision:TRUSTED_HELPER_REVISION}:m.type==='login'?new Promise(()=>{}):undefined)
  const pending=clickTrustedLogin(job,url,active),assertion=expect(pending).rejects.toThrow('page_pending')
  await vi.advanceTimersByTimeAsync(6501);await assertion
  expect(api.runtime.sendMessage.mock.calls.at(-1)[1].type).toBe('stop')
})
