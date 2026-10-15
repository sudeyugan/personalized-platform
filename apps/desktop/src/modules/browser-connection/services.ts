import { useLibraryStore } from '../../state/useLibraryStore'
import { browserOrigin, bilibiliBrowserSites,browserPageUrl } from '../../domain/browser'
import { assertExternalAiAllowed } from '../trust/trustPolicy'
import { browserAccessEnabled } from './authority'
import { resolveBrowserTask, type BrowserTaskGoal } from './taskGoal'
import { browserNative, configureBrowser, type BrowserConnectionStatus, type BrowserSnapshot, type BrowserReadRequest } from './native'
import { BrowserExecution,type BrowserEvidenceRequest } from './execution'
import { configureManagedBrowser,stopManagedBrowser } from './managed/native'
export interface BrowserServices {
  browserTaskGoal?: BrowserTaskGoal
  assertBrowserAuthority?(): void
  authorizeBrowserQueryEgress?():void
  browserStatus?(): Promise<BrowserConnectionStatus>
  browserRead?(request: BrowserReadRequest): Promise<BrowserSnapshot>
  browserVerify?(request:BrowserEvidenceRequest):Promise<unknown>
}
export function createBrowserServices(goal: string, signal?: AbortSignal): BrowserServices {
  const initial = useLibraryStore.getState().data
  const managed=initial.companion.browser?.backend==='managed'
  const identity = JSON.stringify([initial.companion.browser, initial.companion.provider, initial.settings.trust, initial.companion.permissions.fullAccess, initial.companion.permissions.internet])
  const task = resolveBrowserTask(goal, initial.companion)
  const requested = task?.origins ?? []
  const execution=new BrowserExecution(task,goal)
  let loginUsed = false
  const guard = () => {
    if (signal?.aborted) throw new DOMException('浏览器读取已取消', 'AbortError')
    if (!browserAccessEnabled()) throw new Error('浏览器连接、联网权限或外部模型处理未开启；请在AI伙伴设置中核对')
    const live = useLibraryStore.getState().data
    if (JSON.stringify([live.companion.browser, live.companion.provider, live.settings.trust, live.companion.permissions.fullAccess, live.companion.permissions.internet]) !== identity) throw new Error('浏览器范围、模型或隐私设置已改变，本次读取已停止')
    assertExternalAiAllowed(live.companion.provider.providerId, live.settings.trust, 'companion')
  }
  const services:BrowserServices={
    browserTaskGoal: task,
    assertBrowserAuthority: guard,
    authorizeBrowserQueryEgress(){guard();if(!task?.origins.length||task.clarification||initial.companion.browser?.confirmQueryEgress)throw new Error('本次查询没有自动脱敏发送许可')},
    async browserVerify(request){
      guard();if(!requested.includes(request.origin)||!execution.owns(request))throw new Error('证据不属于本次当前页面')
      const fresh=await services.browserRead!({kind:'observe',origin:request.origin,tabId:request.tabId})
      guard();const page=fresh.data as {observationId?:string}
      if(!page.observationId)throw new Error('现场页面无法重新核验')
      return execution.verify({...request,observationId:page.observationId})
    },
    async browserStatus() {
      if(managed){guard();return configureManagedBrowser()}
      const value=await browserNative<BrowserConnectionStatus>('browser_bridge_status')
      // The settings-only local path may contain a Windows username. Never
      // expose it through an agent tool or a model-bound connection result.
      return {enabled:value.enabled,paired:value.paired,online:value.online,sites:value.sites,browserSites:value.browserSites,epoch:value.epoch,extensionVersion:value.extensionVersion,expectedVersion:value.expectedVersion,updateRequired:value.updateRequired,setupPending:value.setupPending}
    },
    async browserRead(request) {
      guard()
      const origin = browserOrigin(request.origin)
      if (!requested.includes(origin) || (request.kind === 'followed_live' && (task?.objective !== 'followed_live' || !bilibiliBrowserSites.every(site => requested.includes(site))))) throw new Error(task?.clarification ?? '当前用户请求没有明确这个网站或用途；不可自行遍历其他已授权网站')
      // This flag is program-owned and independently opted into per website.
      // Neither model tool arguments nor untrusted page text can grant login.
      if(request.kind==='act'&&!initial.companion.browser?.interactionSites?.includes(origin))throw new Error('本网站尚未允许页面导航与检索，请在网站设置中单独勾选；未执行操作')
      let targetUrl:string|undefined
      if(request.kind==='ensure'){
        const profile=initial.companion.browser?.profiles?.find(item=>item.origin===origin)
        const explicit=[...goal.matchAll(/https?:\/\/[^\s，。；;"'\\<>）)]+/gu)].map(match=>match[0]).find(url=>new URL(url).origin===origin)
        targetUrl=browserPageUrl(explicit??profile?.entryUrl??origin,origin)
      }
      const readRequest = { kind:request.kind, origin, ...(request.tabId !== undefined ? {tabId:request.tabId} : {}),...(targetUrl?{targetUrl}:{}),...(request.kind==='act'?{interaction:request.interaction}:{}) }
      execution.before(readRequest)
      if(managed){
        const status=await configureManagedBrowser();guard()
        const cancel=()=>{void stopManagedBrowser().catch(()=>undefined)}
        signal?.addEventListener('abort',cancel,{once:true})
        try{guard();const result=await browserNative<BrowserSnapshot>('managed_browser_request',{request:{...readRequest,queryMode:'background'},expectedEpoch:status.epoch});guard();execution.accept(readRequest,result);return result}
        finally{signal?.removeEventListener('abort',cancel)}
      }
      const cachedLogin = !loginUsed && ['page','observe'].includes(request.kind) && initial.companion.browser?.cachedLoginSites?.includes(origin) === true
      if (cachedLogin) loginUsed = true
      const nativeRequest = { ...readRequest, ...(request.kind!=='followed_live'?{queryMode:initial.companion.browser?.foregroundQueries===true?'foreground':'background'}:{}), ...(cachedLogin ? { cachedLogin: true } : {}) }
      const status = await configureBrowser(true, initial.companion.browser?.sites ?? [], false, initial.companion.browser?.cachedLoginSites ?? [],initial.companion.browser?.interactionSites??[]); guard()
      const cancel = () => { void browserNative('browser_bridge_cancel').catch(() => undefined) }
      signal?.addEventListener('abort', cancel, { once: true })
      try { guard(); const result = await browserNative<BrowserSnapshot>('browser_bridge_request', { request: nativeRequest, expectedEpoch: status.epoch }); guard();execution.accept(readRequest,result);return result }
      finally { signal?.removeEventListener('abort', cancel) }
    },
  }
  return services
}
