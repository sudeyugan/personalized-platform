import { describe,expect,it } from 'vitest'
import { publicAddress,origin,pageUrl,interaction,networkPolicy } from '../../../../browser-runtime/policy.mjs'
import { BrowserEngine } from '../../../../browser-runtime/engine.mjs'
describe('local browser executor boundaries',()=>{
  it('rejects local networks, credentials and unsafe entries',()=>{
    for(const raw of ['http://example.com','https://localhost','https://127.0.0.1','https://[::1]','https://example.local','https://user:password@example.com','https://example.com:99'])expect(()=>origin(raw)).toThrow()
    for(const address of ['127.0.0.1','10.0.0.1','172.16.0.1','192.168.1.1','169.254.169.254','100.64.0.1','::1','::ffff:127.0.0.1','fc00::1'])expect(publicAddress(address)).toBe(false)
    expect(publicAddress('8.8.8.8')).toBe(true)
    expect(()=>pageUrl('https://example.com/?token=x','https://example.com')).toThrow()
  })
  it('requires bounded current references and never accepts a script/password operation',()=>{
    for(const operation of ['javascript','password','delete'])expect(()=>interaction({observationId:crypto.randomUUID(),elementId:crypto.randomUUID(),operation})).toThrow()
    expect(()=>interaction({observationId:crypto.randomUUID(),elementId:crypto.randomUUID(),operation:'fill',query:'password=x'})).toThrow()
  })
  it('blocks cross-site navigations before DNS/network dispatch',async()=>{
    let aborted=false,continued=false
    await networkPolicy(['https://example.com'])({request:()=>({url:()=> 'https://other.com/',isNavigationRequest:()=>true}),abort:async()=>{aborted=true},continue:async()=>{continued=true}})
    expect(aborted).toBe(true);expect(continued).toBe(false)
  })
  it('does not launch on configuration and rejects login on an unapproved site',async()=>{
    let count=0
    const engine=new BrowserEngine('/fictional',async()=>{count++;throw new Error('should not launch')})
    await engine.configure({sites:['https://example.com'],interactions:[]})
    await expect(engine.login('https://other.com','https://other.com')).rejects.toThrow('PERMISSION')
    expect(count).toBe(0)
  })
})
