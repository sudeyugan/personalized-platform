import { beforeEach,expect,it,vi } from 'vitest'
import { createSeedLibrary } from '../../../domain/seed'
import { useLibraryStore } from '../../../state/useLibraryStore'
import { sendCompanionTurn } from '../../companion/companionConversation'
import { finishManagedBrowserLogin } from './native'
import { cancelBrowserHandoff,receiveBrowserHandoff } from './handoff'
import type { AgentModelRequest } from '../../companion/agent/types'
const mock=vi.hoisted(()=>({native:vi.fn(),generate:vi.fn()}))
vi.mock('../native',()=>({browserNative:mock.native,configureBrowser:vi.fn()}))
vi.mock('../../../infrastructure/companionProvider',()=>({createCompanionProvider:()=>({id:'mock',generate:mock.generate,testConnection:async()=>''})}))
vi.mock('../../privacy',()=>({createPrivacyProtectedProvider:(provider:unknown)=>provider}))
vi.mock('../../../infrastructure/libraryRepository',()=>({libraryRepository:{save:vi.fn(async()=>{})}}))
const origin='https://mail.example.com'
beforeEach(()=>{
  cancelBrowserHandoff();mock.native.mockReset();mock.generate.mockReset()
  const data=createSeedLibrary();data.settings.trust.externalAiProcessing=true;data.companion.browser={enabled:true,backend:'managed',sites:[origin],interactionSites:[origin],cachedLoginSites:[origin]};useLibraryStore.setState({data})
})
it('resumes the same private question after explicit finish, with fresh IDs and no duplicate user bubble/history',async()=>{
  let logged=false
  mock.native.mockImplementation(async(name,args)=>{
    if(name==='managed_browser_configure')return {epoch:5}
    if(name==='managed_browser_finish_login'){logged=true;return {origin,mode:'idle'}}
    const r=args.request
    return {verified:true,origin,data:r.kind==='tabs'?[{tabId:logged?9:7}]:{origin,tabId:r.tabId,url:origin+'/inbox',title:'虚构邮箱',observationId:crypto.randomUUID(),text:logged?'未读邮件 2':'',controls:[],loading:false,truncated:false,...(!logged?{loginState:'managed_unfilled'}:{})}}
  })
  mock.generate.mockImplementation(async(input:AgentModelRequest)=>{
    const result=JSON.parse([...input.messages].reverse().find(m=>m.role==='tool')!.content).data.data
    return {type:'tool_call',call:{id:crypto.randomUUID(),name:'browser.verify',arguments:{origin,tabId:9,observationId:result.observationId,quotes:['未读邮件 2'],answer:'当前页面显示2封未读邮件。'}}}
  })
  const messages=vi.fn();let continued:Promise<string>|undefined
  const off=receiveBrowserHandoff('main',goal=>{continued=sendCompanionTurn(goal,{resumeBrowserTask:true,onTransientMessage:messages});return true})
  expect(await sendCompanionTurn('查看我的邮箱有多少未读邮件',{onTransientMessage:messages})).toContain('尚未进入账号页面')
  expect(mock.generate).not.toHaveBeenCalled()
  expect((await finishManagedBrowserLogin()).resumed).toBe(true)
  expect(await continued).toContain('2封未读邮件')
  expect(messages.mock.calls.filter(([message])=>message.role==='user')).toHaveLength(1)
  expect(useLibraryStore.getState().data.companion.messages).toHaveLength(0)
  expect(JSON.stringify(useLibraryStore.getState().data.companion.agentAudit)).not.toMatch(/observationId|未读邮件|tabId/)
  off()
})
it('collects and verifies several pages through normal tools and displays only the bounded summary',async()=>{
  let page=1
  mock.native.mockImplementation(async(name,args)=>{
    if(name==='managed_browser_configure')return {epoch:5}
    const r=args.request
    let value:unknown
    if(r.kind==='tabs')value=[{tabId:7}]
    else if(r.kind==='act'){page++;value={actionStatus:'dispatched'}}
    else value={origin,tabId:7,url:origin+'/inbox',title:'虚构邮箱',observationId:crypto.randomUUID(),text:`未读邮件 ${page}\nPRIVATE-BODY${page}${page===2?'\n没有更多了':''}`,controls:page===1?[{id:crypto.randomUUID(),operation:'invoke',name:'下一页'}]:[],loading:false,truncated:false}
    return {verified:true,origin,data:value}
  })
  mock.generate.mockImplementation(async(input:AgentModelRequest)=>{
    const result=JSON.parse([...input.messages].reverse().find(m=>m.role==='tool')!.content).data
    return result.collectionId?{type:'tool_call',call:{id:crypto.randomUUID(),name:'browser.verify_collection',arguments:{origin,tabId:7,collectionId:result.collectionId,quotes:[{page:1,text:'未读邮件 1'},{page:2,text:'未读邮件 2'}],answer:'已访问页面分别显示未读邮件1和2。'}}}:{type:'tool_call',call:{id:crypto.randomUUID(),name:'browser.collect',arguments:{origin,tabId:7}}}
  })
  const reply=await sendCompanionTurn('逐页汇总我的邮箱未读邮件')
  expect(reply).toContain('已核对本次连续浏览');expect(reply).toContain('本次访问 2 页');expect(reply).toContain('列表末尾')
  expect(reply).not.toMatch(/PRIVATE-BODY|collectionId|observationId/)
  expect(mock.generate).toHaveBeenCalledTimes(2)
  expect(JSON.stringify([useLibraryStore.getState().data.companion.messages,useLibraryStore.getState().data.companion.agentAudit,useLibraryStore.getState().data.companion.operations])).not.toMatch(/PRIVATE-BODY|collectionId|observationId|未读邮件 [12]/)
})
