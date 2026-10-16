import type { BrowserSnapshot,BrowserReadRequest } from './native'
import type { BrowserTaskGoal } from './taskGoal'
import { checkBrowserEvidence } from './evidence'

export interface CollectionRequest{origin:string;tabId:number}
export interface CollectionEvidence extends CollectionRequest{collectionId:string;quotes:Array<{page:number;text:string}>;answer:string}
type Page={tabId:number;origin:string;url:string;title:string;text:string;observationId:string;loading:boolean;truncated:boolean;loginState?:string;controls:Array<{id:string;name:string;operation:string}>}
export type CollectionStop='end_marker'|'no_next'|'ambiguous_next'|'page_limit'|'time_limit'|'repeated_page'|'page_unavailable'|'read_failed'
export const collectionStopLabels:Record<CollectionStop,string>={end_marker:'页面提示已到列表末尾',no_next:'未找到明确的下一页',ambiguous_next:'下一页控件不唯一',page_limit:'已达到本轮4页上限',time_limit:'已达到本轮时间上限',repeated_page:'页面没有变化或出现循环',page_unavailable:'页面仍在加载、需要登录或内容已截断',read_failed:'后续页面未能读到'}
const usable=(page:Page)=>page&&typeof page.text==='string'&&typeof page.observationId==='string'&&Array.isArray(page.controls)&&!page.loading&&!page.truncated&&(!page.loginState||page.loginState==='continued')
const fingerprint=(page:Page)=>JSON.stringify([page.url,page.text])
/** Bounded current-list traversal. Never scripts, selectors, automatic filters,
 * account enumeration, old IDs, saved page data or claims about a whole account. */
export class BrowserCollection{
  private current?:{id:string;request:CollectionRequest;pages:Page[];stop:CollectionStop;expires:number}
  private read:(request:BrowserReadRequest)=>Promise<BrowserSnapshot>
  private goal:string
  private task?:BrowserTaskGoal
  private spent=false
  constructor(read:(request:BrowserReadRequest)=>Promise<BrowserSnapshot>,goal:string,task?:BrowserTaskGoal){this.read=read;this.goal=goal;this.task=task}
  clear(){this.current=undefined}
  async collect(request:CollectionRequest){
    if(this.spent)throw new Error('本轮已经连续浏览过一次；请依据已有证据核验，不重复遍历')
    this.spent=true
    const state={id:crypto.randomUUID(),request,pages:[] as Page[],stop:'page_limit' as CollectionStop,expires:Date.now()+90000}
    this.current=state
    const fingerprints=new Set<string>()
    for(let index=0;index<4;index++){
      if(Date.now()>=state.expires){state.stop='time_limit';break}
      let page:Page
      try{const result=await this.read({kind:'observe',...request});if(result.verified!==true)throw new Error('unverified');page=result.data as Page}
      catch(error){if(!state.pages.length)throw error;state.stop='read_failed';break}
      if(!usable(page)){state.stop='page_unavailable';break}
      if(fingerprints.has(fingerprint(page))){state.stop='repeated_page';break}
      fingerprints.add(fingerprint(page));state.pages.push(page)
      const next=page.controls.filter(control=>control.operation==='invoke'&&/^(?:下一页|下页|next(?:\s+page)?)[\s›»>]*$/iu.test(control.name.trim()))
      if(next.length>1){state.stop='ambiguous_next';break}
      if(!next.length){state.stop=/(?:没有更多(?:了|内容|结果)?|已(?:经)?到(?:达)?(?:列表)?(?:底|末尾)|已是最后一页|no more (?:results|items)|end of (?:list|results))/iu.test(page.text)?'end_marker':'no_next';break}
      if(index===3)break
      if(Date.now()>=state.expires){state.stop='time_limit';break}
      try{const result=await this.read({kind:'act',...request,interaction:{observationId:page.observationId,elementId:next[0].id,operation:'invoke'}});if(result.verified!==true||(result.data as {actionStatus?:string})?.actionStatus!=='dispatched')throw new Error('not dispatched')}
      catch{state.stop='read_failed';break}
    }
    const seen=new Set<string>()
    const pages=state.pages.map((page,index)=>({page:index+1,url:page.url,title:page.title,text:page.text.split('\n').filter(line=>{const key=line.trim();if(!key||seen.has(key))return false;seen.add(key);return true}).join('\n')}))
    return {collectionId:state.id,...request,pages,visitedPages:pages.length,stopReason:state.stop,coverage:collectionStopLabels[state.stop],scope:'visited_pages',complete:false,untrusted:true,privateBrowser:true,verified:true}
  }
  async verify(input:CollectionEvidence){
    const state=this.current
    if(!state||state.id!==input.collectionId||state.expires<=Date.now()||input.origin!==state.request.origin||input.tabId!==state.request.tabId||!state.pages.length)throw new Error('跨页证据不属于本轮当前目标或已经过期')
    if(!Array.isArray(input.quotes)||!input.quotes.length||input.quotes.length>8||input.quotes.some(quote=>!Number.isInteger(quote.page)||!state.pages[quote.page-1]?.text.includes(quote.text)))throw new Error('每段跨页证据必须逐字来自对应已访问页面')
    const result=await this.read({kind:'observe',...state.request}),fresh=result.data as Page,last=state.pages.at(-1)!
    if(result.verified!==true||!usable(fresh)||fingerprint(last)!==fingerprint(fresh))throw new Error('末页已经变化或无法复核，请重新查询；没有把历史分页当作当前结果')
    checkBrowserEvidence(this.goal,this.task?.objective,state.pages.map(page=>page.text).join('\n'),input.quotes.map(quote=>quote.text),input.answer)
    return {goalVerified:true,answer:input.answer,quotes:input.quotes.map(quote=>quote.text),url:last.url,title:last.title,partial:true,scope:'visited_pages',visitedPages:state.pages.length,coverage:collectionStopLabels[state.stop],verified:true}
  }
}
