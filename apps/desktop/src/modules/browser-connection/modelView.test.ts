import { expect,it,vi } from 'vitest'
import { controlLabel,projectBrowserRequest,statisticalEvidence } from './modelView'
import { createPrivacyProtectedProvider } from '../privacy/egressGateway'
import { createSeedLibrary } from '../../domain/seed'
import type { AgentModelRequest,AgentModelProvider } from '../companion/agent/types'
import type { PrivacyReviewRequest } from '../privacy/types'
const request=(content=false):AgentModelRequest=>({tools:[],context:{page:'browser-query',companion:{name:'小鱼'},localTime:{date:'2026-10-17',time:'12:00',weekday:'周六',period:'中午',timeZone:'Asia/Shanghai'}},messages:[{role:'user',content:'总结当前内容'},
  {role:'tool',content:JSON.stringify({success:true,data:{privateBrowser:true,verified:true,origin:'https://example.com',...(content?{contentReview:true}:{}),data:{tabId:1,observationId:'fresh',title:'PRIVATE-ACCOUNT',url:'https://example.com/user/PRIVATE-ID',text:'未读邮件 2\nPRIVATE-BODY\nfirst@example.com',loading:false,truncated:false,controls:[{id:'button',operation:'invoke',name:'查看 PRIVATE-SUBJECT 未读'}]}}})}]})
it('withholds private page bodies, subject labels and account paths while retaining fixed controls and literal evidence',()=>{
  const result=JSON.stringify(projectBrowserRequest(request()).request)
  expect(result).toContain('未读邮件 2');expect(result).toContain('查看 未读')
  expect(result).not.toMatch(/PRIVATE|first@example.com|\/user\//)
  expect(controlLabel('未知私密姓名',0)).toBe('控件 1')
})
it('locally identifies a name the user already supplied using only a boolean, not the private control label',()=>{
  const input=request();input.messages[0].content='查看高等数学的作业'
  const value=JSON.parse(input.messages[1].content);value.data.data.controls=[{id:'course',operation:'invoke',name:'查看高等数学'},{id:'other',operation:'invoke',name:'查看PRIVATE-OTHER-COURSE'}];input.messages[1].content=JSON.stringify(value)
  const page=JSON.parse(projectBrowserRequest(input).request.messages[1].content).data.data
  expect(page.controls.map((control:{matchesRequest:boolean})=>control.matchesRequest)).toEqual([true,false])
  expect(JSON.stringify(page.controls)).not.toMatch(/高等数学|PRIVATE/)
})
it('retains exact bounded evidence when DOM text nodes split the unread label and number over lines',()=>{
  expect(statisticalEvidence('PRIVATE-BODY\n未读邮件\n16\nPRIVATE-SUBJECT')).toBe('未读邮件\n16')
  expect(statisticalEvidence('16\n封\n未读邮件\nPRIVATE-SUBJECT')).toBe('16\n封\n未读邮件')
  expect(statisticalEvidence('未读\n邮件\n2')).toBe('未读\n邮件\n2')
})
it('forces content review despite ordinary automatic query consent and only sends the approved sanitized excerpt',async()=>{
  const generate=vi.fn(async()=>({type:'text' as const,text:'摘要'})),review=vi.fn(async(_request:PrivacyReviewRequest)=>true)
  const source:AgentModelProvider={id:'fixture',generate,testConnection:async()=>''}
  const provider=createPrivacyProtectedProvider(source,{trust:createSeedLibrary().settings.trust,destination:'fixture',purpose:'test',authorizeSanitizedQuery:()=>{},requestReview:review})
  await provider.generate(request());expect(review).not.toHaveBeenCalled();expect(JSON.stringify(generate.mock.calls)).not.toContain('PRIVATE-BODY')
  await provider.generate(request(true));expect(review).toHaveBeenCalledTimes(1)
  expect(review.mock.calls[0][0]).toMatchObject({fullPreview:true,sanitizedPreview:expect.stringContaining('PRIVATE-BODY')})
  expect(JSON.stringify(generate.mock.calls)).toContain('PRIVATE-BODY');expect(JSON.stringify(generate.mock.calls)).not.toContain('first@example.com')
  await provider.generate(request(true));expect(review).toHaveBeenCalledTimes(1)
})
it('does not send content when review is missing, denied, revoked or contains a credential',async()=>{
  const generate=vi.fn(async()=>({type:'text' as const,text:'unused'})),source:AgentModelProvider={id:'fixture',generate,testConnection:async()=>''}
  const options={trust:createSeedLibrary().settings.trust,destination:'fixture',purpose:'test',authorizeSanitizedQuery:()=>{}}
  await expect(createPrivacyProtectedProvider(source,options).generate(request(true))).rejects.toThrow('无法确认')
  await expect(createPrivacyProtectedProvider(source,{...options,requestReview:async()=>false}).generate(request(true))).rejects.toThrow('已取消')
  let valid=true
  await expect(createPrivacyProtectedProvider(source,{...options,assertAllowed:()=>{if(!valid)throw new Error('撤销')},requestReview:async()=>{valid=false;return true}}).generate(request(true))).rejects.toThrow('撤销')
  const secret=request(true);secret.messages[1].content=secret.messages[1].content.replace('PRIVATE-BODY','password=fictional-secret')
  await expect(createPrivacyProtectedProvider(source,{...options,requestReview:async()=>true}).generate(secret)).rejects.toThrow('已阻止')
  expect(generate).not.toHaveBeenCalled()
})
