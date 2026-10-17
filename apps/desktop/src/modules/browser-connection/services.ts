import { useLibraryStore } from '../../state/useLibraryStore'
import { browserOrigin, bilibiliBrowserSites,browserPageUrl } from '../../domain/browser'
import { assertExternalAiAllowed } from '../trust/trustPolicy'
import { browserAccessEnabled } from './authority'
import { resolveBrowserTask, type BrowserTaskGoal } from './taskGoal'
import { browserNative, configureBrowser, type BrowserConnectionStatus, type BrowserSnapshot, type BrowserReadRequest } from './native'
import { BrowserExecution,type BrowserEvidenceRequest } from './execution'
import { configureManagedBrowser,stopManagedBrowser } from './managed/native'
import { BrowserCollection,type CollectionRequest,type CollectionEvidence } from './collection'
import { BROWSER_AGENT_LIMITS } from './agentPolicy'
export interface BrowserServices {
  browserTaskGoal?: BrowserTaskGoal
  assertBrowserAuthority?(): void
  authorizeBrowserQueryEgress?():void
  browserStatus?(): Promise<BrowserConnectionStatus>
  browserRead?(request: BrowserReadRequest): Promise<BrowserSnapshot>
  browserVerify?(request:BrowserEvidenceRequest):Promise<unknown>
  browserContent?(request:{origin:string;tabId:number}):Promise<BrowserSnapshot&{contentReview:true}>
  browserHandoff?():{origin:string;epoch:number}|undefined
  browserCollect?(request:CollectionRequest):Promise<unknown>
  browserVerifyCollection?(request:CollectionEvidence):Promise<unknown>
}
export function createBrowserServices(goal: string, signal?: AbortSignal): BrowserServices {
  const initial = useLibraryStore.getState().data
  const managed=initial.companion.browser?.backend==='managed'
  const identity = JSON.stringify([initial.companion.browser, initial.companion.provider, initial.settings.trust, initial.companion.permissions.fullAccess, initial.companion.permissions.internet])
  const task = resolveBrowserTask(goal, initial.companion)
  const requested = task?.origins ?? []
  const execution=new BrowserExecution(task,goal)
  let loginUsed = false
  let handoff:{origin:string;epoch:number}|undefined
  let reads=0,actions=0,contentReads=0,collecting=false,uncertainAction=false
  const deadline=Date.now()+BROWSER_AGENT_LIMITS.elapsedMs
  const collection=new BrowserCollection(request=>services.browserRead!(request),goal,task)
  const guard = () => {
    if (signal?.aborted) throw new DOMException('浏览器读取已取消', 'AbortError')
    if (!browserAccessEnabled()) throw new Error('浏览器连接、联网权限或外部模型处理未开启；请在AI伙伴设置中核对')
    const live = useLibraryStore.getState().data
    if (JSON.stringify([live.companion.browser, live.companion.provider, live.settings.trust, live.companion.permissions.fullAccess, live.companion.permissions.internet]) !== identity) throw new Error('浏览器范围、模型或隐私设置已改变，本次读取已停止')
    assertExternalAiAllowed(live.companion.provider.providerId, live.settings.trust, 'companion')
  }
  const services:BrowserServices={
    browserHandoff:()=>handoff,
    async browserCollect(request){
      guard();if(!managed)throw new Error('连续浏览目前只在专用浏览器启用，兼容模式仍可逐页观察')
      if(!/(?:全部|所有|查全|多页|翻页|逐页|连续|继续查找|汇总|all\b|pages?\b)/iu.test(goal))throw new Error('本次只要求普通查询，未授权连续翻页；如需汇总请明确范围')
      if(!requested.includes(request.origin)||!initial.companion.browser?.interactionSites?.includes(request.origin))throw new Error('本次目标尚未允许页面导航与检索')
      collecting=true;try{const result=await collection.collect(request);guard();return result}finally{collecting=false}
    },
    async browserVerifyCollection(request){guard();const result=await collection.verify(request);guard();return result},
    browserTaskGoal: task,
    async browserContent(request){
      guard()
      if(!/(?:总结|摘要|概括|正文|内容|说了什么|写了什么|阅读|读一下|summari[sz]|content)/iu.test(goal))throw new Error('本次只需普通查询，没有明确正文理解目的；未申请外发私人正文')
      if(++contentReads>2)throw new Error('本轮正文节选已达到2次上限，请缩小内容范围')
      const result=await services.browserRead!({kind:'observe',...request})
      const page=result.data as {text?:string;loading?:boolean;loginState?:string}
      if(page.loading||page.loginState&&page.loginState!=='continued'||typeof page.text!=='string')throw new Error('当前没有可审查的稳定正文')
      return {...result,contentReview:true,data:{...page,text:page.text.slice(0,2000)}}
    },
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
      if(++reads>BROWSER_AGENT_LIMITS.requests||Date.now()>=deadline)throw new Error('本轮浏览已达到24次页面请求或3分钟预算，请缩小范围')
      if(request.kind==='act'){if(uncertainAction)throw new Error('本轮操作结果尚未确认，只能观察核验，不能重新执行');if(++actions>BROWSER_AGENT_LIMITS.actions)throw new Error('本轮已达到8次低风险页面动作上限');if(!collecting)collection.clear()}
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
      // Model parameter provenance is checked locally, never sent as an extra
      // native capability or evaluated by webpage code.
      if(readRequest.interaction){const {intent: _intent,...interaction}=readRequest.interaction;readRequest.interaction=interaction}
      if(managed){
        const status=await configureManagedBrowser();guard()
        const cachedLogin=['page','observe'].includes(request.kind)&&initial.companion.browser?.cachedLoginSites?.includes(origin)===true
        const cancel=()=>{void stopManagedBrowser().catch(()=>undefined)}
        signal?.addEventListener('abort',cancel,{once:true})
        try{guard();const result=await browserNative<BrowserSnapshot>('managed_browser_request',{request:{...readRequest,queryMode:'background',...(cachedLogin?{cachedLogin:true}:{})},expectedEpoch:status.epoch});guard();execution.accept(readRequest,result);const state=(result.data as {loginState?:string})?.loginState;if(result.verified===true&&state?.startsWith('managed_'))handoff={origin,epoch:status.epoch};return result}
        catch(error){const code=(error as {browserCode?:string})?.browserCode;if(request.kind==='act'&&(!code||['BROWSER_ACTION_UNKNOWN','BROWSER_MANAGED_FAILED'].includes(code)))uncertainAction=true;throw error}
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
