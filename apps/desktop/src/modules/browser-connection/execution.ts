import { ExecutionSession } from '../task-kernel/session'
import type { BrowserReadRequest,BrowserSnapshot } from './native'
import type { BrowserTaskGoal } from './taskGoal'
import { checkBrowserEvidence } from './evidence'
import { checkBrowserParameter } from './parameters'
import { browserNativeError } from './nativeError'
import { BROWSER_AGENT_LIMITS } from './agentPolicy'

interface Observation {observationId:string;text:string;url:string;title:string;loading:boolean;truncated:boolean;loginState?:string;controls:Array<{id:string;operation:string;name?:string}>}
export interface BrowserEvidenceRequest {origin:string;tabId:number;observationId:string;quotes:string[];answer:string}
export class BrowserExecution {
  readonly session=new ExecutionSession('browser',BROWSER_AGENT_LIMITS.requests)
  private readonly observations=new Map<string,Observation>()
  private readonly task:BrowserTaskGoal|undefined
  private readonly goal:string
  constructor(task:BrowserTaskGoal|undefined,goal:string){this.task=task;this.goal=goal}
  before(request:BrowserReadRequest){
    this.session.transition(request.kind==='act'?'acting':request.kind==='ensure'?'preparing':'observing')
    if(request.kind!=='act')return
    const key=`${request.origin}:${request.tabId}`,page=this.observations.get(key),action=request.interaction
    if(!page||!action||action.observationId!==page.observationId||page.loading||page.loginState&&page.loginState!=='continued'||!page.controls.some(control=>control.id===action.elementId&&control.operation===action.operation))throw browserNativeError('BROWSER_STALE:')
    checkBrowserParameter(this.goal,action,page.controls.find(control=>control.id===action.elementId)!)
    this.observations.delete(key)
  }
  accept(request:BrowserReadRequest,result:BrowserSnapshot){
    if(!['page','observe'].includes(request.kind)||result.verified!==true)return
    const page=result.data as Observation|undefined
    if(page&&typeof page.observationId==='string'&&typeof page.text==='string'&&Array.isArray(page.controls))this.observations.set(`${request.origin}:${request.tabId}`,page)
  }
  owns(input:BrowserEvidenceRequest){return this.observations.get(`${input.origin}:${input.tabId}`)?.observationId===input.observationId}
  verify(input:BrowserEvidenceRequest){
    this.session.transition('verifying')
    const page=this.observations.get(`${input.origin}:${input.tabId}`)
    if(!page||page.observationId!==input.observationId||page.loading||page.loginState&&page.loginState!=='continued')throw new Error('没有当前可用页面证据，不能确认目标完成')
    if(!Array.isArray(input.quotes)||input.quotes.length>3)throw new Error('证据必须为1至3段当前页面文字')
    checkBrowserEvidence(this.goal,this.task?.objective,page.text,input.quotes,input.answer)
    this.session.transition('verified')
    return {goalVerified:true,answer:input.answer,quotes:input.quotes,url:page.url,title:page.title,partial:page.truncated,scope:'current_page',verified:true}
  }
}
