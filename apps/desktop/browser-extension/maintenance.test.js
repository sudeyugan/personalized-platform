import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {maintenanceData,maintainConnection} from './maintenance.js'
vi.mock('./revision.js',()=>({EXTENSION_REVISION:'a'.repeat(64)}))
let saved,grants,api
const config=(overrides={})=>({version:'0.2.0',revision:'a'.repeat(64),ready:true,enabled:true,sites:['https://mail.example.com'],epoch:4,setup:null,...overrides})
beforeEach(()=>{
  saved={};grants=[]
  api={runtime:{getManifest:()=>({version:'0.2.0'}),getURL:path=>`chrome-extension://fixture/${path}`,reload:vi.fn()},storage:{local:{get:vi.fn(async()=>saved),set:vi.fn(async value=>Object.assign(saved,value))}},permissions:{getAll:vi.fn(async()=>({origins:grants.map(site=>`${site}/*`)})),remove:vi.fn(async({origins})=>{grants=grants.filter(site=>!origins.includes(`${site}/*`));return true}),request:vi.fn()},tabs:{create:vi.fn(async()=>({id:1}))}}
  vi.stubGlobal('chrome',api)
})
afterEach(()=>vi.unstubAllGlobals())
describe('paired fixed maintenance only',()=>{
  it('does not grant or open a website in the background, and releases deleted sites',async()=>{
    grants=['https://mail.example.com','https://removed.example.com']
    await maintainConnection(config())
    expect(api.permissions.remove).toHaveBeenCalledWith({origins:['https://removed.example.com/*']})
    expect(api.permissions.request).not.toHaveBeenCalled();expect(api.tabs.create).not.toHaveBeenCalled()
    grants=[];await maintainConnection(config());expect(api.permissions.request).not.toHaveBeenCalled()
  })
  it('opens only its own confirmation page for a current explicit request',async()=>{
    const setup={id:'b'.repeat(64),sites:['https://mail.example.com'],openOrigin:'https://mail.example.com',epoch:4}
    await maintainConnection(config({setup}));expect(api.tabs.create).toHaveBeenCalledWith({url:'chrome-extension://fixture/setup.html'})
    expect(saved.pendingSetup).toMatchObject(setup);expect(api.permissions.request).not.toHaveBeenCalled()
    await maintainConnection(config());expect(api.tabs.create).toHaveBeenCalledTimes(1)
    await maintainConnection(config({epoch:5}));expect(saved.pendingSetup).toBeNull()
  })
  it('reloads once per packaged revision, even at the same manifest version, and never loops',async()=>{
    const changed=config({revision:'c'.repeat(64)})
    expect((await maintainConnection(changed)).stop).toBe(true);expect(api.runtime.reload).toHaveBeenCalledOnce()
    expect((await maintainConnection(changed)).error).toContain('重新加载一次');expect(api.runtime.reload).toHaveBeenCalledOnce()
    await maintainConnection(config({version:'0.3.0',revision:'d'.repeat(64)}));expect(api.runtime.reload).toHaveBeenCalledTimes(2)
  })
  it('never reloads while a read is in progress or resources are incomplete',async()=>{
    await maintainConnection(config({revision:'c'.repeat(64),ready:false}));await maintainConnection(config({revision:'c'.repeat(64)}),true)
    expect(api.runtime.reload).not.toHaveBeenCalled()
  })
  it('rejects malformed targets, wildcard/credential URL, wrong epoch and arbitrary code',()=>{
    for(const value of [config({sites:['https://*.example.com']}),config({version:'javascript:evil'}),config({revision:'not-a-revision'}),config({epoch:-1}),config({setup:{id:'b'.repeat(64),sites:['https://other.example.com'],epoch:4}}),config({setup:{id:'b'.repeat(64),sites:['https://mail.example.com'],epoch:5}}),config({setup:{id:'b'.repeat(64),sites:['https://mail.example.com'],epoch:4,openOrigin:'https://user:password@mail.example.com'}})])expect(()=>maintenanceData(value)).toThrow()
    expect(api.tabs.create).not.toHaveBeenCalled();expect(api.runtime.reload).not.toHaveBeenCalled()
  })
})
