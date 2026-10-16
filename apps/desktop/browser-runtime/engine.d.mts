import type { BrowserContext,BrowserType } from 'playwright-core'
export class BrowserEngine {
  constructor(profile:string,launcher?:(options:Parameters<BrowserType['launchPersistentContext']>[1])=>Promise<BrowserContext>)
  context:BrowserContext|null
  mode:string
  configure(value:{sites:string[];interactions:string[];logins?:string[]}):Promise<{mode:string}>
  login(site:string,url:string):Promise<{mode:string}>
  finishLogin():Promise<{mode:string;origin:string}>
  record(command:{action:string;origin?:string;url?:string;recordingId?:string}):Promise<unknown>
  close():Promise<void>
  request(request:{kind:string;origin:string;tabId?:number;targetUrl?:string;interaction?:unknown;cachedLogin?:boolean}):Promise<unknown>
}
