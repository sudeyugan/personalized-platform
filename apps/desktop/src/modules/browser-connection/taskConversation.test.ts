import {beforeEach,describe,expect,it,vi} from 'vitest'
import {createSeedLibrary} from '../../domain/seed'
import {useLibraryStore} from '../../state/useLibraryStore'
import {sendCompanionTurn} from '../companion/companionConversation'
import {forgetBrowserTurn} from './taskSession'
import type {AgentModelRequest} from '../companion/agent/types'
const calls=vi.hoisted(()=>({native:vi.fn(),generate:vi.fn()}))
vi.mock('./native',()=>({browserNative:calls.native,configureBrowser:vi.fn(async()=>({epoch:3}))}))
vi.mock('../../infrastructure/companionProvider',()=>({createCompanionProvider:()=>({id:'mock',generate:calls.generate,testConnection:async()=>''})}))
vi.mock('../privacy',()=>({createPrivacyProtectedProvider:(provider:unknown)=>provider}))
vi.mock('../../infrastructure/libraryRepository',()=>({libraryRepository:{save:vi.fn(async()=>{})}}))
beforeEach(()=>{vi.clearAllMocks();calls.native.mockReset();calls.generate.mockReset();forgetBrowserTurn('main');forgetBrowserTurn('desktop')})
const origin='https://portal.example.com'
function setup(role:'portal'|'mail'|'general'){
  const data=createSeedLibrary();data.settings.trust.externalAiProcessing=true;data.companion.browser={enabled:true,sites:[origin],profiles:[{origin,role,label:role==='portal'?'学校门户':'自定义网站'}],interactionSites:[origin],cachedLoginSites:[origin]};useLibraryStore.setState({data})
  let stage=0,observationId=crypto.randomUUID();const elementId=crypto.randomUUID()
  calls.native.mockImplementation(async(_command,args)=>{
    const request=args.request
    let value:unknown
    if(request.kind==='tabs')value=[]
    else if(request.kind==='ensure')value=[{tabId:42,title:'目标页面',url:origin+'/'}]
    else if(request.kind==='act'){stage=1;value={actionStatus:'dispatched',origin,tabId:42}}
    else{observationId=crypto.randomUUID();value={tabId:42,origin,url:origin+(stage?'/results':'/'),title:'虚构网站',text:stage?(role==='mail'?'未读邮件 2 PRIVATE-MAIL-BODY':'学校通知 2 条 PRIVATE-NOTICE-BODY'):'首页，需打开目标分组',loading:false,truncated:false,observationId,controls:stage?[]:[{id:elementId,name:role==='mail'?'未读':'通知',operation:'invoke'}],...(request.cachedLogin?{loginState:'continued'}:{})}}
    return {verified:true,privateBrowser:true,untrusted:true,origin,fetchedAtEpochMs:Date.now(),data:value}
  })
  calls.generate.mockImplementation(async(request:AgentModelRequest)=>{
    const last=[...request.messages].reverse().find(message=>message.role==='tool')!
    const page=JSON.parse(last.content).data.data
    if(page.controls.length)return {type:'tool_call',call:{id:crypto.randomUUID(),name:'browser.act',arguments:{origin,tabId:42,observationId:page.observationId,elementId:page.controls[0].id,operation:'invoke'}}}
    return {type:'tool_call',call:{id:crypto.randomUUID(),name:'browser.verify',arguments:{origin,tabId:42,observationId:page.observationId,quotes:[role==='mail'?'未读邮件 2':'学校通知 2 条'],answer:role==='mail'?'当前页面显示2封未读邮件。':'当前页面显示2条学校通知。'}}}
  })
}
describe('whole authorized tasks across website roles',()=>{
  it.each(['portal','mail'] as const)('prepares a missing page, observes, navigates, re-observes and verifies %s',async role=>{
    setup(role)
    const reply=await sendCompanionTurn(role==='mail'?'查看我的邮箱有未读邮件吗':'查看我的学校通知')
    expect(reply).toContain(role==='mail'?'2封未读邮件':'2条学校通知');expect(reply).toContain('已核对本次页面证据')
    expect(calls.native.mock.calls.map(([,args])=>args.request.kind)).toEqual(['tabs','ensure','page','act','observe','observe'])
    expect(calls.generate).toHaveBeenCalledTimes(2)
    const companion=useLibraryStore.getState().data.companion
    expect(JSON.stringify([companion.messages,companion.agentAudit,companion.operations])).not.toMatch(/PRIVATE-|observationId|elementId|"tabId"/)
    expect(companion.operations?.[0].pattern).toContain('browser.verify')
  })
  it.each([true,false])('continues a clarification; persistent target learning respects enabled=%s',async learning=>{
    setup('general')
    useLibraryStore.getState().data.companion.operationLearning={enabled:learning,ignoredPatterns:[]}
    expect(await sendCompanionTurn('查看我的邮箱有未读邮件吗')).toContain('哪一个邮箱')
    expect(calls.native).not.toHaveBeenCalled()
    // Same driver/site, now fake unread evidence for the user-resolved mail task.
    calls.native.mockImplementation(async(_command,args)=>({verified:true,origin,data:args.request.kind==='tabs'?[{tabId:42}]:{tabId:42,origin,url:origin+'/',title:'邮箱',text:'未读邮件 2',loading:false,truncated:false,observationId:'fixture',controls:[]}}))
    calls.generate.mockImplementation(async(request:AgentModelRequest)=>{const last=JSON.parse(request.messages.filter(message=>message.role==='tool').at(-1)!.content).data.data;return {type:'tool_call',call:{id:'verify',name:'browser.verify',arguments:{origin,tabId:42,observationId:last.observationId,quotes:['未读邮件 2'],answer:'有2封未读邮件。'}}}})
    const reply=await sendCompanionTurn('就是https://portal.example.com/')
    expect(reply).toContain('2封未读邮件');expect(calls.native.mock.calls[0][1].request.origin).toBe(origin)
    expect(useLibraryStore.getState().data.companion.browser?.preferredSites?.mail).toBe(learning?origin:undefined)
    calls.native.mockClear();const next=await sendCompanionTurn('查看我的邮箱有未读邮件吗')
    if(learning){expect(next).toContain('2封未读邮件');expect(calls.native.mock.calls[0][1].request.origin).toBe(origin)}
    else{expect(next).toContain('哪一个邮箱');expect(calls.native).not.toHaveBeenCalled()}
  })
  it('does not turn a read page into a completed goal if the model refuses to verify',async()=>{
    setup('portal');calls.generate.mockResolvedValue({type:'text',text:'已经看完了，没有新通知。'})
    const reply=await sendCompanionTurn('查看我的学校通知')
    expect(reply).toContain('没有取得符合本次目标的核验证据');expect(reply).not.toContain('没有新通知')
  })
})
