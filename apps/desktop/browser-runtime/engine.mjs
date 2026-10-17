import { chromium } from 'playwright-core'
import { origin, pageUrl, networkPolicy } from './policy.mjs'
import { observe, release, safePageUrl } from './observe.mjs'
import { act } from './actions.mjs'
import { followed } from './followed.mjs'
import { continueLogin } from './login.mjs'
import { protectLoginRedirects } from './login-redirects.mjs'
import { ManagedRecorder } from './recording.mjs'

export class BrowserEngine {
  constructor(profile, launcher=options=>chromium.launchPersistentContext(profile,options)) {
    this.launcher=launcher;this.context=null;this.mode='idle';this.sites=[];this.interactions=[]
    this.pages=new Map();this.observations=new Map();this.sequence=0;this.taskSite=null;this.logins=[];this.loginAttempts=new Set()
  }
  async close() {
    await this.recorder?.stop();this.recorder=undefined
    const context=this.context;this.context=null;this.mode='idle';this.taskSite=null
    for(const observation of this.observations.values())await release(observation)
    this.observations.clear();this.pages.clear();this.loginAttempts.clear();await context?.close()
  }
  async configure(value) {
    if(!Array.isArray(value.sites) || value.sites.length>32 || !Array.isArray(value.interactions))throw new Error('BROWSER_ARGUMENT')
    const sites=[...new Set(value.sites.map(site=>{if(origin(site)!==site)throw new Error('BROWSER_SITE');return site}))]
    if(value.interactions.some(site=>!sites.includes(site)))throw new Error('BROWSER_SITE')
    const logins=value.logins??[]
    if(!Array.isArray(logins)||logins.some(site=>!sites.includes(site)))throw new Error('BROWSER_SITE')
    if(JSON.stringify([sites,value.interactions,logins])!==JSON.stringify([this.sites,this.interactions,this.logins]))await this.close()
    this.sites=sites;this.interactions=value.interactions;this.logins=logins;return {mode:this.mode}
  }
  async launch(mode) {
    if(this.context&&this.mode===mode)return
    await this.close()
    const context=await this.launcher({channel:'msedge',chromiumSandbox:true,headless:mode==='background',viewport:{width:1280,height:900},acceptDownloads:false,serviceWorkers:'block',permissions:[],timeout:20000})
    this.context=context;this.mode=mode
    const network=networkPolicy(this.sites,{manualLogin:mode==='login'})
    await context.route('**/*',async route=>{
      if(route.request().isNavigationRequest() && this.mode!=='login' && new URL(route.request().url()).origin!==this.taskSite)return route.abort('blockedbyclient')
      return network(route)
    })
    context.on('page',page=>this.register(page))
    context.on('close',()=>{if(this.context===context){this.context=null;this.mode='idle';this.pages.clear();this.observations.clear()}})
    for(const page of context.pages())this.register(page)
  }
  register(page) {
    if([...this.pages.values()].includes(page))return
    const id=++this.sequence;this.pages.set(id,page)
    page.on('download',download=>void download.cancel());page.on('dialog',dialog=>void dialog.dismiss())
    page.on('close',()=>{this.pages.delete(id);const previous=this.observations.get(id);this.observations.delete(id);void release(previous)})
  }
  async settle(page) {
    await page.waitForLoadState('domcontentloaded',{timeout:10000}).catch(()=>{throw new Error('BROWSER_PAGE_PENDING')})
    await page.locator('body').waitFor({state:'attached',timeout:5000})
    // Fixed local readiness predicate: no model-supplied JS and no waiting for
    // unrelated clocks/ads to stop changing all of body.innerText.
    await page.waitForFunction(()=>document.readyState==='complete'&&!!document.body&&!Array.from(document.querySelectorAll('[aria-busy="true"]')).some(node=>node.getClientRects().length),{},{timeout:8000}).catch(()=>{throw new Error('BROWSER_PAGE_PENDING')})
  }
  async login(site,url) {
    if(this.recorder||this.mode==='recording')throw new Error('BROWSER_BUSY')
    if(!this.sites.includes(site))throw new Error('BROWSER_SITE_PERMISSION')
    const target=pageUrl(url,site);await this.launch('login')
    const page=this.context.pages()[0]??await this.context.newPage()
    this.loginSite=site;await page.goto(target,{waitUntil:'domcontentloaded',timeout:15000});return {mode:'login'}
  }
  async finishLogin(){if(this.mode!=='login')throw new Error('BROWSER_ARGUMENT');const site=this.loginSite;await this.close();this.loginSite=undefined;return {mode:'idle',origin:site}}
  async record(command){
    if(command.action==='begin'){
      if(this.mode==='login'||this.recorder)throw new Error('BROWSER_BUSY')
      const site=origin(command.origin)
      if(!this.sites.includes(site))throw new Error('BROWSER_SITE_PERMISSION')
      const target=pageUrl(command.url,site);await this.launch('recording');this.taskSite=site
      const page=this.context.pages()[0]??await this.context.newPage()
      await protectLoginRedirects(page,site)
      await page.goto(target,{waitUntil:'domcontentloaded',timeout:15000})
      this.recorder=new ManagedRecorder(page,site,[...this.pages.entries()].find(([,value])=>value===page)[0])
      return this.recorder.start()
    }
    if(!this.recorder)return command.action==='status'?null:Promise.reject(new Error('BROWSER_STALE'))
    if(command.action!=='status'&&command.recordingId!==this.recorder.id)throw new Error('BROWSER_STALE')
    const result=command.action==='status'?await this.recorder.poll():await this.recorder.control(command.action)
    if(result===null)await this.close()
    return result
  }
  async request(request) {
    const site=origin(request.origin)
    if(!this.sites.includes(site))throw new Error('BROWSER_SITE_PERMISSION')
    if(this.recorder||this.mode==='login'||this.mode==='recording')throw new Error('BROWSER_LOGIN_ACTIVE')
    await this.launch('background');this.taskSite=site
    if(request.kind==='followed_live')return followed(this.context,this.sites)
    const matching=()=>[...this.pages.entries()].filter(([,page])=>!page.isClosed()&&new URL(page.url()).origin===site)
    const tab=async([tabId,page])=>({tabId,origin:site,title:(await page.title()).slice(0,200),url:safePageUrl(page.url(),site)})
    if(request.kind==='tabs')return Promise.all(matching().slice(0,20).map(tab))
    if(request.kind==='ensure') {
      const target=pageUrl(request.targetUrl??site,site)
      const existing=matching().find(([,page])=>page.url()===target)??matching()[0]
      if(existing){await protectLoginRedirects(existing[1],site);return [await tab(existing)]}
      const page=await this.context.newPage()
      try{await protectLoginRedirects(page,site);await page.goto(target,{waitUntil:'domcontentloaded',timeout:15000});await this.settle(page);return [await tab([...this.pages.entries()].find(([,value])=>value===page))]}
      catch{await page.close();throw new Error('BROWSER_PAGE_OPEN')}
    }
    const page=this.pages.get(request.tabId)
    if(!page || page.isClosed() || new URL(page.url()).origin!==site)throw new Error('BROWSER_TAB_CHANGED')
    if(request.kind==='page'||request.kind==='observe') {
      await this.settle(page);await release(this.observations.get(request.tabId))
      const login=await continueLogin(page,site,request.cachedLogin===true&&this.logins.includes(site),this.loginAttempts)
      await this.settle(page)
      const result=await observe(page,request.tabId,site,this.interactions.includes(site))
      if(login){
        result.value.loginState=login==='continued'&&result.value.loginState?'managed_pending':login
        if(result.value.loginState!=='continued'){await release(result);result.refs.clear();result.value.controls=[];result.value.text='';result.value.links=[]}
      }
      this.observations.set(request.tabId,result);return result.value
    }
    if(request.kind==='act') {
      if(!this.interactions.includes(site))throw new Error('BROWSER_SITE_PERMISSION')
      const observation=this.observations.get(request.tabId);this.observations.delete(request.tabId)
      let nextTabId
      try{
        const popup=await act(page,observation,request.interaction)
        if(popup){await popup.waitForLoadState('domcontentloaded',{timeout:8000}).catch(()=>{throw new Error('BROWSER_ACTION_UNKNOWN')});if(new URL(popup.url()).origin!==site)throw new Error('BROWSER_ACTION_UNKNOWN');this.register(popup);nextTabId=[...this.pages.entries()].find(([,value])=>value===popup)?.[0]}
        try{await this.settle(popup??page)}catch{throw new Error('BROWSER_ACTION_UNKNOWN')}
      }finally{await release(observation)}
      return {tabId:request.tabId,origin:site,actionStatus:'dispatched',...(nextTabId?{nextTabId}:{})}
    }
    throw new Error('BROWSER_ARGUMENT')
  }
}
