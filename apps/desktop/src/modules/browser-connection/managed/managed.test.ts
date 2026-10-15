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
it('routes the actual task to the dedicated backend without cached password login or foreground flags',async()=>{
  await createBrowserServices('查看我的邮箱有没有未读邮件').browserRead!({kind:'ensure',origin,cachedLogin:true,queryMode:'foreground'})
  expect(mock.native).toHaveBeenCalledWith('managed_browser_configure',{enabled:true,sites:[origin],interactionSites:[]})
  expect(mock.native).toHaveBeenCalledWith('managed_browser_request',{request:{kind:'ensure',origin,targetUrl:origin+'/',queryMode:'background'},expectedEpoch:8})
  expect(mock.configure).not.toHaveBeenCalled();expect(mock.native.mock.calls.some(([name])=>name.startsWith('browser_bridge'))).toBe(false)
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
