import { afterEach,beforeEach,expect,it,vi } from 'vitest'
import { createSeedLibrary } from '../../domain/seed'
import { useLibraryStore } from '../../state/useLibraryStore'
import { sendCompanionTurn } from '../companion/companionConversation'
import { browserDateRange } from './parameters'
import type { AgentModelRequest } from '../companion/agent/types'
const mock=vi.hoisted(()=>({native:vi.fn(),generate:vi.fn()}))
vi.mock('@tauri-apps/api/core',()=>({invoke:mock.native}))
vi.mock('../../infrastructure/companionProvider',()=>({createCompanionProvider:()=>({id:'fixture-cloud',generate:mock.generate,testConnection:async()=>''})}))
vi.mock('../../infrastructure/libraryRepository',()=>({libraryRepository:{save:vi.fn(async()=>{})}}))
const origin='https://example.com'
beforeEach(()=>{
  mock.native.mockReset();mock.generate.mockReset()
  vi.stubGlobal('__TAURI_INTERNALS__',{})
  const data=createSeedLibrary();data.settings.trust.externalAiProcessing=true;data.companion.browser={enabled:true,backend:'managed',sites:[origin],interactionSites:[origin]}
  useLibraryStore.setState({data})
})
afterEach(()=>vi.unstubAllGlobals())
it('plans model-interpreted dates and sorting through normal tools without sending page bodies or native parameter provenance',async()=>{
  let phase=0
  mock.native.mockImplementation(async(name,args)=>{
    if(name==='managed_browser_configure')return {epoch:3}
    const r=args.request
    let value:unknown
    if(r.kind==='tabs')value=[{tabId:7,origin,title:'PRIVATE-ACCOUNT',url:origin+'/PRIVATE-PATH'}]
    else if(r.kind==='act'){
      expect(r.interaction.intent).toBeUndefined()
      expect(r.interaction.query).toBe(phase===0?browserDateRange('this_week').start:phase===1?browserDateRange('this_week').end:'从新到旧')
      phase++;value={tabId:7,origin,actionStatus:'dispatched'}
    }else value={tabId:7,origin,title:'PRIVATE-TITLE',url:origin+'/PRIVATE-PATH',observationId:crypto.randomUUID(),text:'通知 2 条\nPRIVATE-BODY\nfirst@example.com',loading:false,truncated:false,controls:[{id:crypto.randomUUID(),operation:phase<2?'fill':'select',name:phase===0?'开始日期（YYYY-MM-DD）':phase===1?'结束日期（YYYY-MM-DD）':'时间排序（从旧到新、从新到旧）'}]}
    return {verified:true,privateBrowser:true,untrusted:true,origin,fetchedAtEpochMs:Date.now(),data:value}
  })
  mock.generate.mockImplementation(async(request:AgentModelRequest)=>{
    const serialized=JSON.stringify(request);expect(serialized).not.toMatch(/PRIVATE-|first@example.com/)
    const page=JSON.parse([...request.messages].reverse().find(message=>message.role==='tool')!.content).data.data
    const control=page.controls[0]
    const boundary=phase===0?'start':'end'
    const args=phase<2?{origin,tabId:7,observationId:page.observationId,elementId:control.id,operation:'fill',query:browserDateRange('this_week')[boundary],intent:{source:'本周',kind:'date',range:'this_week',boundary}}:phase===2?{origin,tabId:7,observationId:page.observationId,elementId:control.id,operation:'select',query:control.choices[1].value,intent:{source:'最新的排前面',kind:'option'}}:{origin,tabId:7,observationId:page.observationId,quotes:['通知 2 条'],answer:'当前页面显示2条通知。'}
    return {type:'tool_call',call:{id:crypto.randomUUID(),name:phase<3?'browser.act':'browser.verify',arguments:args}}
  })
  const reply=await sendCompanionTurn(`查看 ${origin} 本周通知，最新的排前面`)
  expect(reply).toContain('2条通知');expect(phase).toBe(3);expect(mock.generate).toHaveBeenCalledTimes(4)
  expect(JSON.stringify([useLibraryStore.getState().data.companion.messages,useLibraryStore.getState().data.companion.agentAudit])).not.toMatch(/PRIVATE-|observationId|first@example.com/)
})
