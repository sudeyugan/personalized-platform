import { beforeEach,expect,it,vi } from 'vitest'
import { createSeedLibrary } from '../../../domain/seed'
import { normalizeBrowser } from '../../../domain/browser'
import { useLibraryStore } from '../../../state/useLibraryStore'
import { createBrowserServices } from '../services'
import { browserNativeError } from '../nativeError'
const mock=vi.hoisted(()=>({native:vi.fn(),configure:vi.fn()}))
vi.mock('../native',()=>({browserNative:mock.native,configureBrowser:mock.configure}))
const origin='https://mail.example.com'
beforeEach(()=>{
  mock.native.mockReset();mock.configure.mockReset()
  const data=createSeedLibrary();data.settings.trust.externalAiProcessing=true
  data.companion.browser={backend:'managed',enabled:true,sites:[origin],cachedLoginSites:[origin],foregroundQueries:true}
  useLibraryStore.setState({data})
  mock.native.mockImplementation(async command=>command==='managed_browser_configure'?{epoch:8,backend:'managed',enabled:true,online:true,paired:true,sites:[origin],browserSites:[origin]}:{verified:true,data:[]})
})
it('keeps old settings on Edge and only retains an explicitly selected managed backend',()=>{
  expect(normalizeBrowser({enabled:true,sites:[origin]}).backend).toBeUndefined()
  expect(normalizeBrowser({enabled:true,sites:[origin],backend:'managed'}).backend).toBe('managed')
})
it('does not tell dedicated-browser users to reload an extension or keep a daily tab open',()=>{
  for(const code of ['BROWSER_SITE_PERMISSION','BROWSER_RESULT','BROWSER_TAB_CHANGED','BROWSER_TIMEOUT'])expect(browserNativeError(code+': PRIVATE-SECRET','managed_browser_request').message).not.toMatch(/PRIVATE-SECRET|重新加载|保持目标页面|Edge确认/u)
})
it('routes dedicated queries in background and keeps login opt-in separate from model flags',async()=>{
  await createBrowserServices('查看我的邮箱有没有未读邮件').browserRead!({kind:'ensure',origin,cachedLogin:true,queryMode:'foreground'})
  expect(mock.native).toHaveBeenCalledWith('managed_browser_configure',{enabled:true,sites:[origin],interactionSites:[],cachedLoginSites:[origin]})
  expect(mock.native).toHaveBeenCalledWith('managed_browser_request',{request:{kind:'ensure',origin,targetUrl:origin+'/',queryMode:'background'},expectedEpoch:8})
  expect(mock.configure).not.toHaveBeenCalled();expect(mock.native.mock.calls.some(([name])=>name.startsWith('browser_bridge'))).toBe(false)
})
it('only injects login permission for opted-in page observations, never from model input',async()=>{
  await createBrowserServices('查看我的邮箱').browserRead!({kind:'observe',origin,tabId:8})
  expect(mock.native).toHaveBeenCalledWith('managed_browser_request',{request:{kind:'observe',origin,tabId:8,queryMode:'background',cachedLogin:true},expectedEpoch:8})
  useLibraryStore.getState().data.companion.browser!.cachedLoginSites=[];mock.native.mockClear()
  await createBrowserServices('查看我的邮箱').browserRead!({kind:'observe',origin,tabId:8,cachedLogin:true})
  expect(mock.native).toHaveBeenCalledWith('managed_browser_request',{request:{kind:'observe',origin,tabId:8,queryMode:'background'},expectedEpoch:8})
})
it('does not fall back to a different account/backend on failure and rejects unrelated websites',async()=>{
  mock.native.mockImplementation(async command=>{if(command==='managed_browser_request')throw new Error('需要专用登录');return {epoch:8}})
  const service=createBrowserServices('查看我的邮箱有没有未读邮件')
  await expect(service.browserRead!({kind:'tabs',origin:'https://other.example.com'})).rejects.toThrow('没有明确')
  await expect(service.browserRead!({kind:'tabs',origin})).rejects.toThrow('专用登录')
  expect(mock.configure).not.toHaveBeenCalled()
})
it('stops the owned worker on abort and discards late private results',async()=>{
  let finish!:(value:unknown)=>void
  mock.native.mockImplementation(command=>command==='managed_browser_request'?new Promise(resolve=>{finish=resolve}):Promise.resolve({epoch:8}))
  const abort=new AbortController(),pending=createBrowserServices('查看我的邮箱',abort.signal).browserRead!({kind:'tabs',origin})
  await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));abort.abort();finish({verified:true,data:{text:'PRIVATE-LATE'}})
  await expect(pending).rejects.toThrow('已取消');expect(mock.native).toHaveBeenCalledWith('managed_browser_cancel')
})
it('changing backend invalidates the in-flight task instead of using its result',async()=>{
  mock.native.mockImplementation(async command=>{if(command==='managed_browser_request')useLibraryStore.getState().data.companion.browser!.backend=undefined;return {epoch:8,verified:true,data:[]}})
  await expect(createBrowserServices('查看我的邮箱').browserRead!({kind:'tabs',origin})).rejects.toThrow('已改变')
})
it('does not let a model expand a normal query into continuous browsing or a different website',async()=>{
  const service=createBrowserServices('查看我的邮箱未读邮件')
  await expect(service.browserCollect!({origin,tabId:8})).rejects.toThrow('未授权连续')
  const data=useLibraryStore.getState().data;data.companion.browser!.interactionSites=[origin]
  await expect(createBrowserServices('逐页汇总我的邮箱未读邮件').browserCollect!({origin:'https://other.com',tabId:8})).rejects.toThrow('本次目标')
  expect(mock.native).not.toHaveBeenCalled()
})
it('counts internal collection requests in the same bounded page budget',async()=>{
  const service=createBrowserServices('查看我的邮箱')
  for(let index=0;index<24;index++)await service.browserRead!({kind:'tabs',origin})
  await expect(service.browserRead!({kind:'tabs',origin})).rejects.toThrow('24次')
  expect(mock.native.mock.calls.filter(([name])=>name==='managed_browser_request')).toHaveLength(24)
})
it('does not repeat an uncertain action even after successfully reobserving',async()=>{
  useLibraryStore.getState().data.companion.browser!.interactionSites=[origin]
  const observationId=crypto.randomUUID(),elementId=crypto.randomUUID(),page={observationId,text:'未读邮件 2',controls:[{id:elementId,name:'查看未读',operation:'invoke'}],loading:false,truncated:false,url:origin+'/inbox',title:'邮箱'}
  let dispatched=0
  mock.native.mockImplementation(async(command,args)=>{
    if(command==='managed_browser_configure')return {epoch:8}
    if(args.request.kind==='act'){dispatched++;throw browserNativeError('BROWSER_ACTION_UNKNOWN:','managed_browser_request')}
    return {verified:true,data:page}
  })
  const service=createBrowserServices('查看我的邮箱未读邮件'),read={kind:'observe' as const,origin,tabId:8},act={kind:'act' as const,origin,tabId:8,interaction:{observationId,elementId,operation:'invoke' as const}}
  await service.browserRead!(read);await expect(service.browserRead!(act)).rejects.toMatchObject({browserCode:'BROWSER_ACTION_UNKNOWN'})
  await service.browserRead!(read);await expect(service.browserRead!(act)).rejects.toThrow('不能重新执行');expect(dispatched).toBe(1)
  expect(await service.browserVerify!({origin,tabId:8,observationId,quotes:['未读邮件 2'],answer:'当前页面显示2封未读邮件。'})).toMatchObject({goalVerified:true})
})
it('does not request page content without a current content purpose and bounds explicit excerpts',async()=>{
  const ordinary=createBrowserServices('查看我的邮箱未读邮件')
  await expect(ordinary.browserContent!({origin,tabId:8})).rejects.toThrow('没有明确正文');expect(mock.native).not.toHaveBeenCalled()
  mock.native.mockImplementation(async command=>command==='managed_browser_configure'?{epoch:8}:{verified:true,data:{text:'虚构正文'.repeat(1000),controls:[],loading:false}})
  const content=createBrowserServices('查看我的邮箱并总结正文内容')
  const result=await content.browserContent!({origin,tabId:8});expect(result.contentReview).toBe(true);expect((result.data as {text:string}).text.length).toBe(2000)
  await content.browserContent!({origin,tabId:8});await expect(content.browserContent!({origin,tabId:8})).rejects.toThrow('2次')
})
