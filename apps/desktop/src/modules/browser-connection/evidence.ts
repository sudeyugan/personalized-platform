import { parseModelReply } from '../companion/replies/modelReply'
export function checkBrowserEvidence(goal:string,objective:string|undefined,text:string,quotes:string[],answer:string){
  if(!quotes.length||quotes.some(quote=>typeof quote!=='string'||!quote.trim()||quote.length>300||!text.includes(quote)||/忽略.*(?:规则|指令)|密码|password|Bearer\s|sk-/iu.test(quote)))throw new Error('证据必须逐字来自当前页面，不使用推测或页面操作指令')
  if(objective==='mail'&&/(?:未读|新邮件|new|unread)/iu.test(goal)&&!quotes.some(quote=>/(?:未读|新邮件|unread|new mail)/iu.test(quote)))throw new Error('未读或新邮件没有明确页面提示，不能据普通邮件列表作结论')
  if(!parseModelReply(JSON.stringify({version:1,blocks:[{type:'paragraph',text:answer}]})))throw new Error('回答不符合安全结果格式')
  if((answer.match(/\d+/gu)??[]).some(number=>!quotes.join(' ').includes(number)))throw new Error('回答中的数量或时间缺少当前证据')
  if(/(?:全部|所有|整个|全账号|all\s+(?:mail|items|results))/iu.test(answer))throw new Error('页面证据只覆盖已访问页面，不能声称全账号或所有结果')
}
