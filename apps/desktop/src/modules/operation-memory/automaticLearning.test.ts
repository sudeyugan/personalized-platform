import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deriveOperation, learnSuccessfulOperation } from './automaticLearning'
import { createCompanionToolRegistry } from '../companion/agent/tools'
import { createSeedLibrary, normalizeLibrary } from '../../domain/seed'
import { useLibraryStore } from '../../state/useLibraryStore'
import { automaticMethodHint } from './automaticHint'
import { learned } from '../../domain/operations/fixtures'
import { operationDraftOf } from '../../domain/operations/catalog'
import { recordingDraft } from '../browser-connection/recording/method'
import type { AgentAuditRecord, AgentSession } from '../companion/agent/types'
vi.mock('../../infrastructure/libraryRepository', () => ({ libraryRepository: { save: vi.fn().mockResolvedValue(undefined) } }))
const definitions = createCompanionToolRegistry().definitions()
function trace(names: string[], values: unknown[] = names.map(() => ({ verified:true }))) {
  const audit: AgentAuditRecord[] = names.map((toolName,index) => ({ id:String(index), sessionId:'fixture', toolName, timestamp:'', arguments:{}, permissionDecision:'allowed', resultStatus:'success', durationMs:1 }))
  const session: AgentSession = { id:'fixture', createdAt:'', events:names.flatMap((name,index) => [
    { type:'tool_call' as const, call:{id:String(index),name,arguments:{origin:'https://example.com',tabId:93827,title:'PRIVATE-FIRST-ARGUMENT'}}, timestamp:'' },
    { type:'tool_result' as const, name,callId:String(index),result:{success:true,data:values[index]},timestamp:'' },
  ]) }
  return {audit,session}
}
beforeEach(() => { useLibraryStore.setState({data:createSeedLibrary(),saveStatus:'idle'}) })
describe('automatic tool contract learning', () => {
  it('reuses a reviewed demonstration only for its current exact website and detects edits',()=>{
    const origin='https://mail.example.com',data=useLibraryStore.getState().data
    data.companion.browser={enabled:true,backend:'managed',sites:[origin]}
    let current=learned({...recordingDraft({id:'a'.repeat(64),origin,tabId:1,phase:'review',events:['inbox','unread'],remainingSeconds:1},'查看我的邮箱未读'),pattern:undefined,source:undefined})
    const hint=automaticMethodHint('查看我的邮箱未读',[{id:current.id}],{getOperation:()=>current})!
    expect(hint.instruction).toContain('用户审查保存');expect(hint.instruction).toContain('重新定位')
    current={...current,revision:2};expect(()=>hint.assertCurrent()).toThrow('已编辑')
    data.companion.browser.sites=['https://other-mail.example.com'];expect(automaticMethodHint('查看我的邮箱未读',[{id:current.id}],{getOperation:()=>current})).toBeUndefined()
  })
  it('requires actual calls, results and success audits; never captures values or user prose', () => {
    const f=trace(['todo.create'],[{id:'PRIVATE-OBJECT',body:'PRIVATE-RESULT'}])
    const learned=deriveOperation('PRIVATE-USER-MESSAGE',f,definitions)!
    expect(learned.pattern).toBe('todo.create'); expect(learned.draft.title).toContain('待办')
    expect(JSON.stringify(learned)).not.toMatch(/PRIVATE|93827/u)
    expect(deriveOperation('x',{...f,session:{...f.session,events:[]}},definitions)).toBeUndefined()
    f.audit[0].resultStatus='error'; expect(deriveOperation('x',f,definitions)).toBeUndefined()
  })
  it.each([{status:'unknown'},{loading:true},{truncated:true},{verified:false},{found:false}])('does not learn an incomplete chain %j', value => {
    expect(deriveOperation('x',trace(['web.search','web.read_page'],[{verified:true},value]),definitions)).toBeUndefined()
  })
  it('binds browser methods to an exact site and never keeps tab ids/page content', () => {
    const value=deriveOperation('检查邮箱',trace(['browser.tabs','browser.read_page'],[{data:[{tabId:93827}]},{verified:true,data:{text:'PRIVATE-MAIL',loading:false,truncated:false}}]),definitions)!
    expect(value.pattern).toBe('browser.tabs|browser.read_page@https://example.com')
    expect(value.draft.scope).toBe('browser'); expect(value.draft.keywords).toContain('检查邮箱')
    expect(JSON.stringify(value)).not.toMatch(/PRIVATE|93827/u)
    expect(deriveOperation('x',trace(['browser.read_page','todo.list']),definitions)).toBeUndefined()
  })
  it('may learn a verified positive live read without claiming complete coverage; empty unknown is not learned', () => {
    const positive={verified:true,data:{loggedIn:true,complete:false,rooms:[{liveStatus:1}]}}
    expect(deriveOperation('B站关注直播',trace(['browser.followed_live'],[positive]),definitions)?.draft.completion).toContain('complete=true')
    expect(deriveOperation('x',trace(['browser.followed_live'],[{verified:true,data:{loggedIn:true,complete:false,rooms:[]}}]),definitions)).toBeUndefined()
    expect(deriveOperation('看看B站我关注的up主最近有更新的是哪一位',trace(['browser.followed_live'],[positive]),definitions)).toBeUndefined()
    const value=deriveOperation('B站关注直播',trace(['browser.followed_live'],[positive]),definitions)!
    expect(value.draft.keywords).not.toContain('我关注的up主')
    const current=learned({...value.draft,pattern:value.pattern,keywords:['我关注的up主']})
    expect(automaticMethodHint('看看B站我关注的up主最近有更新的是哪一位',[{id:current.id}],{getOperation:()=>current})).toBeUndefined()
  })
  it('automatically saves once and survives normalization, but respects close, edits, disable and deletion', () => {
    const f=trace(['todo.list']); const first=learnSuccessfulOperation('查看待办',f)!
    expect(first.source).toBe('automatic'); expect(learnSuccessfulOperation('查看待办',f)).toBeUndefined()
    const store=useLibraryStore.getState(); store.saveOperation({...operationDraftOf(first),title:'手改方法'},first.id,1)
    learnSuccessfulOperation('查看待办',f); expect(useLibraryStore.getState().data.companion.operations![0].title).toBe('手改方法')
    store.setOperationEnabled(first.id,2,false); expect(learnSuccessfulOperation('查看待办',f)).toBeUndefined()
    store.deleteOperation(first.id,3); expect(learnSuccessfulOperation('查看待办',f)).toBeUndefined()
    expect(normalizeLibrary(useLibraryStore.getState().data).companion.operationLearning?.ignoredPatterns).toEqual(['todo.list'])
    store.setOperationLearning(false); expect(learnSuccessfulOperation('创建待办',trace(['todo.create']))).toBeUndefined()
  })
  it('uses a unique method without a form and detects live version changes', () => {
    let current=learned({pattern:'web.read_page',source:'automatic'})
    const services={getOperation:()=>current}
    const hint=automaticMethodHint('查资料',[{id:current.id}],services)!
    expect(hint.instruction).toContain('不要为了普通读取要求填写'); hint.assertCurrent()
    current={...current,revision:2}; expect(()=>hint.assertCurrent()).toThrow('已编辑')
    expect(automaticMethodHint('讨论方法',[{id:current.id}],services)).toBeUndefined()
    expect(automaticMethodHint('查资料',[{id:current.id},{id:'other'}],services)).toBeUndefined()
  })
})
