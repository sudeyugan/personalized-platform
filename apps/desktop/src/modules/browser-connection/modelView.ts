import type { AgentModelRequest } from '../companion/agent/types'

// Fixed vocabulary only. A name may contain a private subject/account even
// after conventional redaction, so never forward its unrecognized remainder.
const vocabulary=/未读|已读|收件箱|邮件|消息|通知|公告|课程|作业|日程|动态|关注|直播|下一页|上一页|下一|上一|更多|查看|浏览|展开|收起|搜索|查询|查找|关键词|筛选|状态|排序|最新|最早|从新到旧|从旧到新|升序|降序|全部|时间|日期|起始|开始|结束|截止|月份|关闭|取消|返回|向下|滚动|一屏|YYYY-MM-DD|YYYY-MM|inbox|unread|search|filter|sort|next|previous|date|start|end|newest|oldest|ascending|descending|all|close|cancel/giu
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{}
export function controlLabel(raw:unknown,index:number){
  const words=String(raw??'').match(vocabulary)??[]
  const label=[...new Set(words)].join(' ').slice(0,90)||`控件 ${index+1}`
  return label+(/（已选）$/.test(String(raw))?'（已选）':/（未选）$/.test(String(raw))?'（未选）':'')
}
export function statisticalEvidence(raw:unknown){
  const text=typeof raw==='string'?raw:''
  // Only bounded literal statistics. Never retain a matching line/paragraph.
  const pattern=/(?:未读(?:\s{0,3}(?:邮件|消息|通知))?|邮件|通知|公告|课程|作业|结果)[：:\s]{0,4}\d{1,6}(?:\s{0,3}(?:封|条|项|门))?|\d{1,6}\s{0,3}(?:封|条)\s{0,3}未读(?:\s{0,3}(?:邮件|消息))?|暂无未读(?:邮件|消息)?|没有未读(?:邮件|消息)?|没有更多(?:了|内容|结果)?|已是最后一页/gu
  return [...new Set(text.match(pattern)??[])].slice(0,20).join('\n')
}
function matchesRequest(raw:unknown,goal:string){
  const remainder=String(raw??'').replace(vocabulary,'').replace(/[\s\p{P}\d]/gu,'').trim()
  return remainder.length>=2&&goal.normalize('NFKC').replace(/\s/g,'').includes(remainder.normalize('NFKC'))
}
function pageView(value:unknown,content=false,goal=''){
  const page=object(value),controls=Array.isArray(page.controls)?page.controls:[]
  return {tabId:page.tabId,origin:page.origin,observationId:page.observationId,title:'授权页面',text:content&&typeof page.text==='string'?page.text.slice(0,2000):statisticalEvidence(page.text),loading:page.loading,truncated:page.truncated,loginState:page.loginState,
    controls:controls.map((value,index)=>{
      const control=object(value),name=String(control.name??''),choices=control.operation==='select'&&name.includes('（')&&name.endsWith('）')?name.slice(name.indexOf('（')+1,-1).split('、').slice(0,20).map((option,index)=>({value:`option:${index}`,label:controlLabel(option,index),matchesRequest:matchesRequest(option,goal)})):undefined
      return {id:control.id,operation:control.operation,name:controlLabel(name,index),matchesRequest:matchesRequest(name,goal),...(choices?{choices}:{})}
    }),privacyView:content?'reviewed_excerpt':'controls_and_statistics',bodyWithheld:!content}
}
function envelopeView(value:unknown,goal:string){
  const envelope=object(value)
  if(envelope.privateBrowser!==true)return value
  if(Array.isArray(envelope.pages))return {privateBrowser:true,verified:envelope.verified,collectionId:envelope.collectionId,origin:envelope.origin,tabId:envelope.tabId,visitedPages:envelope.visitedPages,stopReason:envelope.stopReason,coverage:envelope.coverage,pages:envelope.pages.map((value,index)=>{const page=object(value);return {page:index+1,text:statisticalEvidence(page.text)}}),bodyWithheld:true}
  const data=envelope.data
  if(Array.isArray(data))return {...envelope,data:data.map(value=>{const tab=object(value);return {tabId:tab.tabId,origin:tab.origin,title:'授权标签页'}})}
  if(typeof object(data).observationId==='string')return {privateBrowser:true,verified:envelope.verified,origin:envelope.origin,data:pageView(data,envelope.contentReview===true,goal),...(envelope.contentReview===true?{contentReview:true}:{})}
  // Fixed action receipts/connection status contain no page body. Unknown
  // private schemas are withheld rather than passed through optimistically.
  const receipt=object(data)
  return {privateBrowser:true,verified:envelope.verified,origin:envelope.origin,data:{tabId:receipt.tabId,nextTabId:receipt.nextTabId,actionStatus:receipt.actionStatus},bodyWithheld:true}
}
export function projectBrowserRequest(request:AgentModelRequest){
  const reviewKeys:string[]=[]
  const goal=request.messages.filter(message=>message.role==='user').at(-1)?.content??''
  const messages=request.messages.map(message=>{
    if(message.role!=='tool')return message
    let result:Record<string,unknown>
    try{result=object(JSON.parse(message.content))}catch{return message}
    const envelope=object(result.data)
    if(envelope.privateBrowser!==true)return message
    if(envelope.contentReview===true)reviewKeys.push(JSON.stringify(pageView(envelope.data,true,goal)))
    return {...message,content:JSON.stringify({...result,data:envelopeView(envelope,goal)})}
  })
  return {request:{...request,messages},reviewKeys}
}
