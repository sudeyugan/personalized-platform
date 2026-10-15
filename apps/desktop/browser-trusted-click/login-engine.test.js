import { afterEach,beforeEach,expect,it,vi } from 'vitest'
import { trustedClick } from './login-engine.js'
const origin='https://mail.example.com',url=`${origin}/login`
let api,validate,job,changed,detached
const event=()=>({addListener:vi.fn(),removeListener:vi.fn()})
beforeEach(()=>{
  job={origin,url,tabId:7};changed=event();detached=event();validate=vi.fn(async()=>({active:true,point:{x:120,y:200}}))
  api={storage:{local:{get:vi.fn(async()=>({reader:'reader'}))}},permissions:{contains:vi.fn(async()=>true)},tabs:{get:vi.fn(async()=>({id:7,incognito:false})),onUpdated:changed},debugger:{attach:vi.fn(async()=>{}),detach:vi.fn(async()=>{}),sendCommand:vi.fn(async()=>{}),onDetach:detached}}
  vi.stubGlobal('chrome',api)
})
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers()})
it('only sends fixed press/release after ordered reader validations, cleans up',async()=>{
  expect(await trustedClick(job,'reader',validate)).toEqual({status:'submitted'})
  expect(validate.mock.calls.map(([mode])=>mode)).toEqual(['assert','target','validate_target','validate_target'])
  expect(api.debugger.sendCommand.mock.calls.map(([,method,p])=>[method,p.type])).toEqual([['Input.dispatchMouseEvent','mousePressed'],['Input.dispatchMouseEvent','mouseReleased']])
  expect(JSON.stringify(api.debugger.sendCommand.mock.calls)).not.toMatch(/Runtime|DOM|Network|value|cookie|password|token/)
  expect(api.debugger.detach).toHaveBeenCalledOnce();expect(changed.removeListener).toHaveBeenCalledOnce();expect(detached.removeListener).toHaveBeenCalledOnce()
})
it('leaves another debugger attached on conflict',async()=>{
  api.debugger.attach.mockRejectedValue(new Error('already attached'))
  await expect(trustedClick(job,'reader',validate)).rejects.toThrow('already attached')
  expect(api.debugger.detach).not.toHaveBeenCalled();expect(api.debugger.sendCommand).not.toHaveBeenCalled()
})
it.each(['permission','reader','navigation','detachment','stop'])('stops after press on %s without another input',async kind=>{
  api.debugger.sendCommand.mockImplementationOnce(async()=>{
    if(kind==='permission')api.permissions.contains.mockResolvedValue(false)
    if(kind==='reader')api.storage.local.get.mockResolvedValue({reader:'other'})
    if(kind==='navigation')changed.addListener.mock.calls[0][0](7,{status:'loading'})
    if(kind==='detachment')detached.addListener.mock.calls[0][0]({tabId:7})
    if(kind==='stop')job.stop()
  })
  await expect(trustedClick(job,'reader',validate)).rejects.toThrow()
  expect(api.debugger.sendCommand).toHaveBeenCalledOnce();expect(api.debugger.detach).toHaveBeenCalledOnce()
})
it('refuses unknown/moved/masked target and incognito',async()=>{
  for(const point of [undefined,{x:NaN,y:10},{x:-1,y:10}]){validate.mockResolvedValue({active:true,point});await expect(trustedClick(job,'reader',validate)).rejects.toThrow('tab_changed')}
  validate.mockResolvedValueOnce({active:true}).mockResolvedValueOnce({active:true,point:{x:1,y:2}}).mockResolvedValueOnce({active:true,point:{x:3,y:2}})
  await expect(trustedClick(job,'reader',validate)).rejects.toThrow('tab_changed')
  api.tabs.get.mockResolvedValue({url,incognito:true});await expect(trustedClick(job,'reader',validate)).rejects.toThrow('tab_changed')
  expect(api.debugger.sendCommand).not.toHaveBeenCalled()
})
it('bounds hanging attach and cleans up a late successful attachment',async()=>{
  vi.useFakeTimers();let finish;api.debugger.attach.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}))
  const assertion=expect(trustedClick(job,'reader',validate)).rejects.toThrow('page_pending')
  await vi.advanceTimersByTimeAsync(6001);await assertion;finish();await Promise.resolve();await Promise.resolve()
  expect(api.debugger.detach).toHaveBeenCalledOnce();expect(api.debugger.sendCommand).not.toHaveBeenCalled()
})
