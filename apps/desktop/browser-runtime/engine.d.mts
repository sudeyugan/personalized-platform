import type { BrowserContext,BrowserType } from 'playwright-core'
export class BrowserEngine {
  constructor(profile:string,launcher?:(options:Parameters<BrowserType['launchPersistentContext']>[1])=>Promise<BrowserContext>)
  context:BrowserContext|null
  mode:string
  configure(value:{sites:string[];interactions:string[]}):Promise<{mode:string}>
  login(site:string,url:string):Promise<{mode:string}>
  close():Promise<void>
  request(request:{kind:string;origin:string;tabId?:number;targetUrl?:string;interaction?:unknown}):Promise<unknown>
}
