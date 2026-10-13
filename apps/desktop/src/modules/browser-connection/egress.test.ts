import { describe, expect, it, vi } from 'vitest'
import { createPrivacyProtectedProvider } from '../privacy/egressGateway'
import { createSeedLibrary } from '../../domain/seed'
import type { AgentModelProvider, AgentModelRequest } from '../companion/agent/types'
const request:AgentModelRequest={messages:[{role:'user',content:'虚构页面'}],tools:[],context:{page:'browser-query',companion:{name:'小鱼'},localTime:{timeZone:'Asia/Shanghai',date:'2026-10-12',time:'12:00',weekday:'周一',period:'中午'}}}
function fixture(){const generate=vi.fn(async()=>({type:'text' as const,text:'虚构结果'}));const provider:AgentModelProvider={id:'fixture-not-mock',generate,testConnection:async()=>''};const trust={...createSeedLibrary().settings.trust,outboundReviewMode:'strict' as const};return {provider,generate,trust}}
describe('private browser egress has live send boundaries',()=>{
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
})
