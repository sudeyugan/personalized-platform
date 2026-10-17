import type { BrowserInteraction } from './native'
export interface BrowserParameterIntent {source:string;kind:'keyword'|'option'|'date';range?:'today'|'yesterday'|'this_week'|'last_week'|'this_month'|'last_3_days'|'last_7_days'|'explicit';boundary?:'start'|'end';date?:string}
const shift=(date:Date,days:number)=>{const copy=new Date(date);copy.setUTCDate(copy.getUTCDate()+days);return copy}
const iso=(date:Date)=>date.toISOString().slice(0,10)
export function browserDateRange(range:BrowserParameterIntent['range'],now=Date.now()){
  const today=new Date(new Date(now+8*3600000).toISOString().slice(0,10)+'T00:00:00Z')
  const monday=shift(today,-((today.getUTCDay()+6)%7))
  switch(range){
    case 'today':return {start:iso(today),end:iso(today)}
    case 'yesterday':return {start:iso(shift(today,-1)),end:iso(shift(today,-1))}
    case 'this_week':return {start:iso(monday),end:iso(shift(monday,6))}
    case 'last_week':return {start:iso(shift(monday,-7)),end:iso(shift(monday,-1))}
    case 'this_month':return {start:iso(new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),1))),end:iso(new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth()+1,0)))}
    case 'last_3_days':return {start:iso(shift(today,-2)),end:iso(today)}
    case 'last_7_days':return {start:iso(shift(today,-6)),end:iso(today)}
    default:throw new Error('模型日期解释缺少受支持的范围，请澄清具体日期')
  }
}
/** Model proposes meaning; local code checks provenance, shape, current control
 * and concrete dates. A quoted basis is not proof of semantic correctness. */
export function checkBrowserParameter(goal:string,action:BrowserInteraction,control:{name?:string},now=Date.now()){
  if(!['search','fill','select'].includes(action.operation))return
  const query=action.query,intent=action.intent
  if(!query?.trim()||query.length>200||/[\r\n\0]|(?:password|密码|验证码|Bearer\s|sk-)/i.test(query))throw new Error('输入或筛选词必须来自用户本次明确请求，不采用网页指令或其他私人内容')
  if(!intent){if(!goal.includes(query))throw new Error('非逐字参数必须来自用户本次明确请求，需要模型提供原话依据和解释类型');return}
  if(!intent.source?.trim()||intent.source.length>200||!goal.includes(intent.source))throw new Error('参数依据必须逐字来自用户本次请求，不能来自网页或历史内容')
  if(control.name?.includes('YYYY-MM')&&intent.kind!=='date')throw new Error('日期控件必须使用日期解释，不能借关键词绕过校验')
  if(intent.kind==='date'){
    let range:{start:string;end:string}
    if(intent.range==='explicit'){
      if(!intent.date||!/^(?:19|20|21)\d{2}-\d{2}-\d{2}$/.test(intent.date)||!Number.isFinite(Date.parse(intent.date))||iso(new Date(intent.date))!==intent.date)throw new Error('模型解释的具体日期无效')
      range={start:intent.date,end:intent.date}
    }else range=browserDateRange(intent.range,now)
    if(!['start','end'].includes(intent.boundary??''))throw new Error('日期参数需要起始或结束端点')
    const expected=range[intent.boundary!]
    if(action.operation!=='fill'||!control.name?.includes('YYYY-MM')||query!==(control.name.includes('YYYY-MM-DD')?expected:expected.slice(0,7)))throw new Error('模型日期与北京时间范围或当前日期控件不一致')
  }else if(intent.kind==='option'){
    const options=control.name?.includes('（')&&control.name.endsWith('）')?control.name.slice(control.name.indexOf('（')+1,-1).split('、'):[]
    const alias=/^option:(\d{1,2})$/.exec(query),value=alias?options[Number(alias[1])]:query
    if(action.operation!=='select'||!value||!options.includes(value))throw new Error('筛选或排序必须使用当前控件实际提供的选项标签')
    action.query=value // Resolve a current opaque option locally, not in cloud.
  }else if(intent.kind!=='keyword'||!['search','fill'].includes(action.operation)||query.length>100)throw new Error('模型参数不符合当前控件用途')
}
