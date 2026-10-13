import { ExecutionSession } from '../task-kernel/session'
import type { BrowserReadRequest,BrowserSnapshot } from './native'
import type { BrowserTaskGoal } from './taskGoal'
import { parseModelReply } from '../companion/replies/modelReply'

interface Observation {observationId:string;text:string;url:string;title:string;loading:boolean;truncated:boolean;loginState?:string;controls:Array<{id:string;operation:string}>}
export interface BrowserEvidenceRequest {origin:string;tabId:number;observationId:string;quotes:string[];answer:string}
export class BrowserExecution {
  readonly session=new ExecutionSession('browser')
  private readonly observations=new Map<string,Observation>()
  private readonly task:BrowserTaskGoal|undefined
  private readonly goal:string
  constructor(task:BrowserTaskGoal|undefined,goal:string){this.task=task;this.goal=goal}
  before(request:BrowserReadRequest){
    this.session.transition(request.kind==='act'?'acting':request.kind==='ensure'?'preparing':'observing')
    if(request.kind!=='act')return
    const key=`${request.origin}:${request.tabId}`,page=this.observations.get(key),action=request.interaction
    if(!page||!action||action.observationId!==page.observationId||page.loading||page.loginState&&page.loginState!=='continued'||!page.controls.some(control=>control.id===action.elementId&&control.operation===action.operation))throw new Error('控件不属于本次已观察页面，请重新观察；没有执行旧引用')
    this.observations.delete(key)
    if(action.operation==='search'&&(!action.query?.trim()||action.query.length>200||!this.goal.includes(action.query)))throw new Error('站内检索词必须来自用户本次明确请求，不采用网页指令或其他私人内容')
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
    if(!Array.isArray(input.quotes)||input.quotes.length<1||input.quotes.length>3||input.quotes.some(quote=>typeof quote!=='string'||!quote.trim()||quote.length>300||!page.text.includes(quote)||/忽略.*(?:规则|指令)|密码|password|Bearer\s|sk-/iu.test(quote)))throw new Error('证据必须逐字来自当前页面，不使用推测或页面操作指令')
    if(this.task?.objective==='mail'&&/(?:未读|新邮件|new|unread)/iu.test(this.goal)&&!input.quotes.some(quote=>/(?:未读|新邮件|unread|new mail)/iu.test(quote)))throw new Error('未读或新邮件没有明确页面提示，不能据普通邮件列表作结论')
    if(!parseModelReply(JSON.stringify({version:1,blocks:[{type:'paragraph',text:input.answer}]})))throw new Error('回答不符合安全结果格式')
    const evidence=input.quotes.join(' '),numbers=input.answer.match(/\d+/gu)??[]
    if(numbers.some(number=>!evidence.includes(number)))throw new Error('回答中的数量或时间缺少当前证据')
    this.session.transition('verified')
    return {goalVerified:true,answer:input.answer,quotes:input.quotes,url:page.url,title:page.title,partial:page.truncated,scope:'current_page',verified:true}
  }
}
