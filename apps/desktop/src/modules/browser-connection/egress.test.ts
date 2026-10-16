import { describe, expect, it, vi } from 'vitest'
import { createPrivacyProtectedProvider } from '../privacy/egressGateway'
import { createSeedLibrary } from '../../domain/seed'
import type { AgentModelProvider, AgentModelRequest } from '../companion/agent/types'
const request:AgentModelRequest={messages:[{role:'user',content:'虚构页面'}],tools:[],context:{page:'browser-query',companion:{name:'小鱼'},localTime:{timeZone:'Asia/Shanghai',date:'2026-10-12',time:'12:00',weekday:'周一',period:'中午'}}}
function fixture(){const generate=vi.fn(async()=>({type:'text' as const,text:'虚构结果'}));const provider:AgentModelProvider={id:'fixture-not-mock',generate,testConnection:async()=>''};const trust={...createSeedLibrary().settings.trust,outboundReviewMode:'strict' as const};return {provider,generate,trust}}
describe('private browser egress has live send boundaries',()=>{
  it('sanitizes every collected page and still blocks secrets nested in cross-page results',async()=>{
    const f=fixture(),provider=createPrivacyProtectedProvider(f.provider,{trust:f.trust,destination:'fixture',purpose:'collection',authorizeSanitizedQuery:()=>{}})
    const message=(text:string)=>({...request,messages:[{role:'tool' as const,content:JSON.stringify({verified:true,privateBrowser:true,pages:[{page:1,text:'first@example.com'},{page:2,text}]})}]})
    await provider.generate(message('second@example.com'))
    expect(JSON.stringify(f.generate.mock.calls)).not.toMatch(/first@example.com|second@example.com/)
    await expect(provider.generate(message('password=fixture-secret-password'))).rejects.toThrow('已阻止')
    expect(f.generate).toHaveBeenCalledTimes(1)
  })
  it('rechecks authorization after an awaited review, before any real send',async()=>{
    const f=fixture();let valid=true
    const protectedProvider=createPrivacyProtectedProvider(f.provider,{trust:f.trust,destination:'fixture',purpose:'test',assertAllowed:()=>{if(!valid)throw new Error('已撤销')},requestReview:async()=>{valid=false;return true}})
    await expect(protectedProvider.generate(request)).rejects.toThrow('已撤销');expect(f.generate).not.toHaveBeenCalled()
  })
  it('discards a late model result after authority changes',async()=>{
    const f=fixture();let valid=true;f.generate.mockImplementation(async()=>{valid=false;return {type:'text',text:'PRIVATE-LATE'}})
    const protectedProvider=createPrivacyProtectedProvider(f.provider,{trust:f.trust,destination:'fixture',purpose:'test',assertAllowed:()=>{if(!valid)throw new Error('已撤销')}})
    await expect(protectedProvider.generate(request)).rejects.toThrow('已撤销')
  })
  it('does not bypass later private-source review because an earlier prompt was reviewed',async()=>{
    const f=fixture(),review=vi.fn(async()=>true)
    const protectedProvider=createPrivacyProtectedProvider(f.provider,{trust:f.trust,destination:'fixture',purpose:'test',requestReview:review,reviewEachRequest:true})
    await protectedProvider.generate(request);await protectedProvider.generate({...request,messages:[...request.messages,{role:'tool',content:'另一条虚构私密来源'}]})
    expect(review).toHaveBeenCalledTimes(2)
  })
  it('automatically sanitizes a scoped authorized query on every round without repeated confirmation',async()=>{
    const f=fixture(),review=vi.fn(async()=>true),authorize=vi.fn(()=>{})
    const provider=createPrivacyProtectedProvider(f.provider,{trust:f.trust,destination:'fixture',purpose:'query',requestReview:review,reviewEachRequest:true,authorizeSanitizedQuery:authorize})
    await provider.generate({...request,messages:[{role:'user',content:'查看 mailbox@example.com 的未读邮件'}]})
    await provider.generate({...request,messages:[{role:'tool',content:'联系人 first@example.com'}]})
    expect(review).not.toHaveBeenCalled();expect(authorize).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(f.generate.mock.calls)).not.toMatch(/mailbox@example.com|first@example.com/)
    expect(JSON.stringify(f.generate.mock.calls)).toContain('[EMAIL_')
  })
  it('never lets automatic query consent bypass secret detection or revoked scope',async()=>{
    const f=fixture(),authorize=vi.fn(()=>{}),review=vi.fn(async()=>true)
    const provider=createPrivacyProtectedProvider(f.provider,{trust:f.trust,destination:'fixture',purpose:'query',requestReview:review,authorizeSanitizedQuery:authorize})
    await expect(provider.generate({...request,messages:[{role:'tool',content:'password=fixture-secret-password'}]})).rejects.toThrow('已阻止')
    expect(f.generate).not.toHaveBeenCalled();expect(authorize).not.toHaveBeenCalled()
    authorize.mockImplementation(()=>{throw new Error('已撤销查询授权')})
    await expect(provider.generate(request)).rejects.toThrow('已撤销查询授权');expect(f.generate).not.toHaveBeenCalled()
  })
})
