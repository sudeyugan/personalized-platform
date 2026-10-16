import { afterEach, describe, expect, it, vi } from 'vitest'
import { networkPolicy } from '../../../../browser-runtime/policy.mjs'
import { BrowserEngine } from '../../../../browser-runtime/engine.mjs'

const site='https://mail.example.com'
function request(url=site,navigation=true){
  return {request:()=>({url:()=>url,isNavigationRequest:()=>navigation}),abort:vi.fn(async()=>{}),continue:vi.fn(async()=>{})}
}
afterEach(()=>vi.useRealTimers())
describe('managed browser login and bounded network checks',()=>{
  it('shares pending DNS across twenty parallel resources and subsequent cache hits',async()=>{
    let finish!:(value:{address:string}[])=>void
    const resolve=vi.fn(()=>new Promise<{address:string}[]>(done=>{finish=done}))
    const policy=networkPolicy([site],{resolve}),routes=Array.from({length:20},(_,i)=>request(`${site}/asset-${i}.js`,false))
    const pending=Promise.all(routes.map(policy));await Promise.resolve()
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(routes.every(route=>route.continue.mock.calls.length===0)).toBe(true)
    finish([{address:'8.8.8.8'}]);await pending
    const later=request(`${site}/later.png`,false);await policy(later)
    expect(resolve).toHaveBeenCalledTimes(1)
    for(const route of [...routes,later]){expect(route.continue).toHaveBeenCalledOnce();expect(route.abort).not.toHaveBeenCalled()}
  })
  it('expires the DNS cache instead of keeping old public addresses indefinitely',async()=>{
    vi.useFakeTimers()
    const resolve=vi.fn().mockResolvedValueOnce([{address:'8.8.8.8'}]).mockResolvedValueOnce([{address:'127.0.0.1'}])
    const policy=networkPolicy([site],{resolve});await policy(request())
    await vi.advanceTimersByTimeAsync(30001)
    const changed=request();await policy(changed)
    expect(resolve).toHaveBeenCalledTimes(2);expect(changed.abort).toHaveBeenCalledWith('blockedbyclient')
    expect(changed.continue).not.toHaveBeenCalled()
  })
  it('fails closed on stalled DNS and never dispatches a late public result',async()=>{
    vi.useFakeTimers()
    let finish!:(value:{address:string}[])=>void
    const resolve=vi.fn(()=>new Promise<{address:string}[]>(done=>{finish=done})),route=request()
    const pending=networkPolicy([site],{resolve})(route)
    await vi.advanceTimersByTimeAsync(3000);await pending
    expect(route.abort).toHaveBeenCalledOnce();expect(route.continue).not.toHaveBeenCalled()
    finish([{address:'8.8.8.8'}]);await Promise.resolve()
    expect(route.continue).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0)
  })
  it('allows public HTTPS SSO navigation only in the explicit manual-login context',async()=>{
    const resolve=vi.fn(async()=>[{address:'8.8.8.8'}]),sites=[site]
    const target='https://id.example.edu/auth/login?return=mail',login=request(target),background=request(target)
    await networkPolicy(sites,{manualLogin:true,resolve})(login)
    expect(login.continue).toHaveBeenCalledOnce();expect(login.abort).not.toHaveBeenCalled()
    resolve.mockClear();await networkPolicy(sites,{resolve})(background)
    expect(background.abort).toHaveBeenCalledWith('blockedbyclient');expect(resolve).not.toHaveBeenCalled()
    expect(sites).toEqual([site])
  })
  it('keeps third-party frames outside the background read scope',async()=>{
    const resolve=vi.fn(async()=>[{address:'8.8.8.8'}]),frame=request('https://id.example.edu/frame')
    await networkPolicy([site],{resolve})(frame)
    expect(frame.abort).toHaveBeenCalledOnce();expect(frame.continue).not.toHaveBeenCalled();expect(resolve).not.toHaveBeenCalled()
  })
  it('never permits local, credential-bearing, non-HTTPS or mixed private DNS in manual login',async()=>{
    const resolve=vi.fn(async()=>[{address:'8.8.8.8'},{address:'192.168.1.1'}])
    const policy=networkPolicy([site],{manualLogin:true,resolve})
    for(const url of ['http://id.example.edu','https://127.0.0.1','https://example.local','https://user:secret@id.example.edu',site]){
      const route=request(url);await policy(route)
      expect(route.abort).toHaveBeenCalledWith('blockedbyclient');expect(route.continue).not.toHaveBeenCalled()
    }
  })
  it('fails closed on DNS errors and clears the deadline timer',async()=>{
    vi.useFakeTimers()
    const route=request();await networkPolicy([site],{resolve:async()=>{throw new Error('DNS_FIXTURE')}})(route)
    expect(route.abort).toHaveBeenCalledOnce();expect(route.continue).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0)
  })
  it('launches login and background with Chromium sandbox enabled, never a no-sandbox fallback',async()=>{
    const launch=vi.fn(async()=>{throw new Error('FIXTURE_STOP')})
    const engine=new BrowserEngine('/fictional',launch)
    await engine.configure({sites:[site],interactions:[]})
    await expect(engine.login(site,site)).rejects.toThrow('FIXTURE_STOP')
    expect(launch).toHaveBeenLastCalledWith(expect.objectContaining({chromiumSandbox:true,headless:false}))
    await expect(engine.request({kind:'tabs',origin:site})).rejects.toThrow('FIXTURE_STOP')
    expect(launch).toHaveBeenLastCalledWith(expect.objectContaining({chromiumSandbox:true,headless:true}))
    expect(launch).toHaveBeenCalledTimes(2)
  })
})
