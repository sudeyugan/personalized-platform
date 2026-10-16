import { chromium } from 'playwright-core'
import { origin, pageUrl, networkPolicy } from './policy.mjs'
import { observe, release, safePageUrl } from './observe.mjs'
import { act } from './actions.mjs'
import { followed } from './followed.mjs'

export class BrowserEngine {
  constructor(profile, launcher=options=>chromium.launchPersistentContext(profile,options)) {
    this.launcher=launcher;this.context=null;this.mode='idle';this.sites=[];this.interactions=[]
    this.pages=new Map();this.observations=new Map();this.sequence=0;this.taskSite=null
  }
  async close() {
    const context=this.context;this.context=null;this.mode='idle';this.taskSite=null
    for(const observation of this.observations.values())await release(observation)
    this.observations.clear();this.pages.clear();await context?.close()
  }
  async configure(value) {
    if(!Array.isArray(value.sites) || value.sites.length>32 || !Array.isArray(value.interactions))throw new Error('BROWSER_ARGUMENT')
    const sites=[...new Set(value.sites.map(site=>{if(origin(site)!==site)throw new Error('BROWSER_SITE');return site}))]
    if(value.interactions.some(site=>!sites.includes(site)))throw new Error('BROWSER_SITE')
    if(JSON.stringify([sites,value.interactions])!==JSON.stringify([this.sites,this.interactions]))await this.close()
    this.sites=sites;this.interactions=value.interactions;return {mode:this.mode}
  }
  async launch(mode) {
    if(this.context&&this.mode===mode)return
    await this.close()
    const context=await this.launcher({channel:'msedge',chromiumSandbox:true,headless:mode!=='login',viewport:{width:1280,height:900},acceptDownloads:false,serviceWorkers:'block',permissions:[],timeout:20000})
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
    let previous='',stable=0
    for(let index=0;index<10;index++) {
      const text=await page.locator('body').innerText({timeout:2000})
      if(text&&text===previous)stable++;else stable=0
      if(stable>=2)return
      previous=text;await new Promise(resolve=>setTimeout(resolve,200))
    }
  }
  async login(site,url) {
    if(!this.sites.includes(site))throw new Error('BROWSER_SITE_PERMISSION')
    const target=pageUrl(url,site);await this.launch('login')
    const page=this.context.pages()[0]??await this.context.newPage()
    await page.goto(target,{waitUntil:'domcontentloaded',timeout:15000});return {mode:'login'}
  }
  async request(request) {
    const site=origin(request.origin)
    if(!this.sites.includes(site))throw new Error('BROWSER_SITE_PERMISSION')
    if(this.mode==='login')throw new Error('BROWSER_LOGIN_ACTIVE')
    await this.launch('background');this.taskSite=site
    if(request.kind==='followed_live')return followed(this.context,this.sites)
    const matching=()=>[...this.pages.entries()].filter(([,page])=>!page.isClosed()&&new URL(page.url()).origin===site)
    const tab=async([tabId,page])=>({tabId,origin:site,title:(await page.title()).slice(0,200),url:safePageUrl(page.url(),site)})
    if(request.kind==='tabs')return Promise.all(matching().slice(0,20).map(tab))
    if(request.kind==='ensure') {
      const target=pageUrl(request.targetUrl??site,site)
      const existing=matching().find(([,page])=>page.url()===target)??matching()[0]
      if(existing)return [await tab(existing)]
      const page=await this.context.newPage()
      try{await page.goto(target,{waitUntil:'domcontentloaded',timeout:15000});await this.settle(page);return [await tab([...this.pages.entries()].find(([,value])=>value===page))]}
      catch{await page.close();throw new Error('BROWSER_PAGE_OPEN')}
    }
    const page=this.pages.get(request.tabId)
    if(!page || page.isClosed() || new URL(page.url()).origin!==site)throw new Error('BROWSER_TAB_CHANGED')
    if(request.kind==='page'||request.kind==='observe') {
      await this.settle(page);await release(this.observations.get(request.tabId))
      const result=await observe(page,request.tabId,site,this.interactions.includes(site))
      this.observations.set(request.tabId,result);return result.value
    }
    if(request.kind==='act') {
      if(!this.interactions.includes(site))throw new Error('BROWSER_SITE_PERMISSION')
      const observation=this.observations.get(request.tabId);this.observations.delete(request.tabId)
      try{await act(page,observation,request.interaction);await this.settle(page)}finally{await release(observation)}
      return {tabId:request.tabId,origin:site,actionStatus:'dispatched'}
    }
    throw new Error('BROWSER_ARGUMENT')
  }
}
