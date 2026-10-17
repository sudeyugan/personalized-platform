import { expect,it } from 'vitest'
import { BrowserQueryFlow } from './queryFlow'
import { BrowserReadBudget } from './budget'
import type { AgentToolCall,AgentToolResult } from '../companion/agent/types'
const origin='https://example.com',task={objective:'page' as const,origins:[origin],candidates:[origin]}
const call:AgentToolCall={id:'act',name:'browser.act',arguments:{origin,tabId:1}}
const failure=(browserCode:string):AgentToolResult=>({success:false,error:{code:'ExecutionFailed',message:'受控诊断',browserCode}})
it('bounds pre-dispatch refresh separately from a single uncertain-action observation',()=>{
  const flow=new BrowserQueryFlow(task,'查看通知')
  expect(flow.advance(call,failure('BROWSER_STALE'))?.nextCall?.name).toBe('browser.observe')
  expect(flow.advance(call,failure('BROWSER_ACTION_BLOCKED'))?.nextCall?.name).toBe('browser.observe')
  expect(flow.advance(call,failure('BROWSER_STALE'))?.reply).toBeTruthy()
  const unknown=new BrowserQueryFlow(task,'查看通知')
  expect(unknown.advance(call,failure('BROWSER_ACTION_UNKNOWN'))?.nextCall?.name).toBe('browser.observe')
  expect(unknown.advance(call,failure('BROWSER_ACTION_UNKNOWN'))?.reply).toBeTruthy()
})
it('follows only a newly returned owned tab ID, then observes before acting',()=>{
  const flow=new BrowserQueryFlow(task,'查看课程公告'),budget=new BrowserReadBudget(true)
  budget.check({id:'tabs',name:'browser.tabs',arguments:{origin}})
  budget.accept({id:'tabs',name:'browser.tabs',arguments:{origin}},{success:true,data:{data:[{tabId:1}]}})
  const result={success:true,data:{verified:true,origin,data:{tabId:1,nextTabId:2,actionStatus:'dispatched'}}}
  budget.accept(call,result)
  expect(flow.advance(call,result)?.nextCall).toMatchObject({name:'browser.observe',arguments:{origin,tabId:2}})
  expect(budget.check({id:'observe',name:'browser.observe',arguments:{origin,tabId:2}})).toBeUndefined()
  expect(budget.check({id:'wrong',name:'browser.observe',arguments:{origin,tabId:3}})).toContain('不能猜测')
})
