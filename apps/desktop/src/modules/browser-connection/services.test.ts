import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSeedLibrary } from '../../domain/seed'
import { useLibraryStore } from '../../state/useLibraryStore'
import { createBrowserServices } from './services'
const mock=vi.hoisted(()=>({native:vi.fn(),configure:vi.fn()}))
vi.mock('./native',()=>({browserNative:mock.native,configureBrowser:mock.configure}))
vi.mock('../../infrastructure/libraryRepository',()=>({libraryRepository:{save:vi.fn(async()=>{})}}))
beforeEach(()=>{
  vi.clearAllMocks();const data=createSeedLibrary();data.settings.trust.externalAiProcessing=true;data.companion.browser={enabled:true,sites:['https://example.com']};useLibraryStore.setState({data})
  mock.configure.mockResolvedValue({epoch:3});mock.native.mockResolvedValue({verified:true,data:{text:'PRIVATE-FIXTURE'}})
})
describe('live browser authority',()=>{
  it('only injects login for a per-site opt-in once per turn; model/native arguments cannot grant it',async()=>{
    const service=createBrowserServices('查看example.com网页')
    await service.browserRead!({kind:'page',origin:'https://example.com',tabId:7,cachedLogin:true})
    expect(mock.native.mock.calls[0][1].request.cachedLogin).toBeUndefined()
    useLibraryStore.getState().data.companion.browser!.cachedLoginSites=['https://example.com']
    const opted=createBrowserServices('查看example.com网页')
    await opted.browserRead!({kind:'page',origin:'https://example.com',tabId:7})
    await opted.browserRead!({kind:'page',origin:'https://example.com',tabId:7})
    expect(mock.native.mock.calls.map(([,args])=>args?.request?.cachedLogin)).toEqual([undefined,true,undefined])
    expect(mock.configure).toHaveBeenLastCalledWith(true,['https://example.com'],false,['https://example.com'],[])
  })
  it('revocation of login opt-in invalidates an in-flight page result',async()=>{
    useLibraryStore.getState().data.companion.browser!.cachedLoginSites=['https://example.com']
    const service=createBrowserServices('查看example.com网页')
    mock.native.mockImplementation(async()=>{useLibraryStore.getState().setCompanionBrowser({cachedLoginSites:[]});return {verified:true,data:{loginState:'continued',text:'PRIVATE-LATE'}}})
    await expect(service.browserRead!({kind:'page',origin:'https://example.com',tabId:7})).rejects.toThrow('已改变')
  })
  it('never exposes a settings-only local username/path through an agent status tool',async()=>{
    mock.native.mockResolvedValue({enabled:true,paired:true,online:true,sites:[],browserSites:[],epoch:3,extensionPath:'C:/Users/PRIVATE-USERNAME/AppData/extension',expectedVersion:'0.2.0'})
    const status=await createBrowserServices('查看example.com网页').browserStatus!()
    expect(status.expectedVersion).toBe('0.2.0');expect(JSON.stringify(status)).not.toMatch(/PRIVATE-USERNAME|extensionPath/)
  })
  it('binds a unique email purpose and rejects live or another site at the actual service boundary',async()=>{
    const data=useLibraryStore.getState().data;data.companion.browser!.sites=['https://webmail.example.com','https://github.com']
    const service=createBrowserServices('查看一下我的邮箱里有新邮件吗')
    expect(service.browserTaskGoal?.origins).toEqual(['https://webmail.example.com'])
    await service.browserRead!({kind:'tabs',origin:'https://webmail.example.com'})
    const count=mock.native.mock.calls.length
    await expect(service.browserRead!({kind:'tabs',origin:'https://github.com'})).rejects.toThrow('没有明确')
    await expect(service.browserRead!({kind:'followed_live',origin:'https://live.bilibili.com'})).rejects.toThrow('没有明确')
    expect(mock.native.mock.calls).toHaveLength(count)
  })
  it('requires a current goal website, not merely a globally granted site',async()=>{
    await expect(createBrowserServices('你好').browserRead!({kind:'tabs',origin:'https://example.com'})).rejects.toThrow('没有明确')
    expect(mock.native).not.toHaveBeenCalled()
    await createBrowserServices('查看example.com网页').browserRead!({kind:'tabs',origin:'https://example.com'})
    expect(mock.native).toHaveBeenCalledWith('browser_bridge_request',{request:{kind:'tabs',origin:'https://example.com'},expectedEpoch:3})
  })
  it('discards late private text if provider or privacy changed',async()=>{
    mock.native.mockImplementation(async()=>{const data=useLibraryStore.getState().data;useLibraryStore.setState({data:{...data,settings:{...data.settings,trust:{...data.settings.trust,externalAiProcessing:false}}}});return {verified:true,data:{text:'PRIVATE-LATE'}}})
    await expect(createBrowserServices('查看example.com').browserRead!({kind:'tabs',origin:'https://example.com'})).rejects.toThrow('未开启')
  })
  it('stops native work on cancellation and ignores late results',async()=>{
    const controller=new AbortController();let release!:(value:unknown)=>void
    mock.native.mockImplementation(command=>command==='browser_bridge_request'?new Promise(resolve=>{release=resolve}):Promise.resolve())
    const result=createBrowserServices('查看example.com',controller.signal).browserRead!({kind:'tabs',origin:'https://example.com'})
    await vi.waitFor(()=>expect(release).toBeTypeOf('function'));controller.abort();release({verified:true,data:{text:'PRIVATE-LATE'}})
    await expect(result).rejects.toThrow('已取消');expect(mock.native).toHaveBeenCalledWith('browser_bridge_cancel')
  })
  it('never reads after permission or browser toggle revocation',async()=>{
    const service=createBrowserServices('查看example.com'),data=useLibraryStore.getState().data
    useLibraryStore.setState({data:{...data,companion:{...data.companion,browser:{...data.companion.browser!,enabled:false}}}})
    await expect(service.browserRead!({kind:'tabs',origin:'https://example.com'})).rejects.toThrow('未开启');expect(mock.native).not.toHaveBeenCalled()
  })
  it('constructs a configured exact entry, not model-supplied URLs, and never opens unrelated sites',async()=>{
    useLibraryStore.getState().data.companion.browser!.profiles=[{origin:'https://example.com',role:'general',entryUrl:'https://example.com/notices'}]
    const service=createBrowserServices('查看example.com网站通知')
    await service.browserRead!({kind:'ensure',origin:'https://example.com',targetUrl:'https://evil.example.com/'})
    expect(mock.native.mock.calls[0][1].request.targetUrl).toBe('https://example.com/notices')
    await expect(service.browserRead!({kind:'ensure',origin:'https://evil.example.com'})).rejects.toThrow('没有明确')
  })
  it('rejects per-site action revocation and rereads evidence before final verification',async()=>{
    const companion=useLibraryStore.getState().data.companion;companion.browser!.interactionSites=['https://example.com']
    const id=crypto.randomUUID(),controlId=crypto.randomUUID(),page={observationId:id,text:'当前信息 2',url:'https://example.com/',title:'门户',loading:false,truncated:false,controls:[{id:controlId,operation:'invoke'}]}
    mock.native.mockResolvedValueOnce({verified:true,data:page}).mockResolvedValueOnce({verified:true,data:{...page,text:'当前信息 3',observationId:crypto.randomUUID()}})
    const service=createBrowserServices('查看example.com网站信息');await service.browserRead!({kind:'page',origin:'https://example.com',tabId:7})
    await expect(service.browserVerify!({origin:'https://example.com',tabId:7,observationId:id,quotes:['当前信息 2'],answer:'当前有2条信息。'})).rejects.toThrow('逐字')
    expect(mock.native.mock.calls[1][1].request.kind).toBe('observe')
    useLibraryStore.getState().setCompanionBrowser({interactionSites:[]})
    await expect(service.browserRead!({kind:'act',origin:'https://example.com',tabId:7,interaction:{observationId:id,elementId:controlId,operation:'invoke'}})).rejects.toThrow('已改变')
  })
  it('prioritizes the current explicit mailbox link over a saved entry and resolves a bare hostname',async()=>{
    const origin='https://mails.tsinghua.edu.cn',browser=useLibraryStore.getState().data.companion.browser!
    browser.sites=[origin];browser.profiles=[{origin,role:'mail',entryUrl:origin+'/old'}]
    await createBrowserServices(`查看我的邮箱 ${origin}/inbox`).browserRead!({kind:'ensure',origin})
    expect(mock.native.mock.calls[0][1].request.targetUrl).toBe(origin+'/inbox')
    delete browser.profiles
    await createBrowserServices('查看一下目前我的邮箱里有没有未读邮件 mails.tsinghua.edu.cn').browserRead!({kind:'ensure',origin})
    expect(mock.native.mock.calls[1][1].request.targetUrl).toBe(origin+'/')
  })
})
