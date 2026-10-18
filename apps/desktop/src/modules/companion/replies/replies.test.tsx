import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CompanionRichText } from '../CompanionRichText'
import { createCompanionToolRegistry } from '../agent/tools'
import type { AgentToolDefinition, AgentToolResult } from '../agent/types'
import type { ToolReceipt } from './types'
import { ReplySession } from './session'
import { toolPresentation } from './toolPresentation'
import { formatReply } from './format'
import { parseModelReply } from './modelReply'
import { safeReplyUrl } from './safety'
import { toSpokenText } from '../speechText'

afterEach(cleanup)
const registry = createCompanionToolRegistry()
function receipt(name: string, data: unknown, args: Record<string,unknown> = {}, error?: string): ToolReceipt {
  const result: AgentToolResult = error ? {success:false,error:{code:'ExecutionFailed',message:error}} : {success:true,data}
  return {call:{id:name,name,arguments:args},result,definition:registry.lookup(name)?.definition}
}
function finish(entry:ToolReceipt, model?:string) { const session=new ReplySession();session.accept(entry);return session.finish(model) }
const model = (blocks: unknown[]) => JSON.stringify({version:1,blocks})

describe('unified reply schema and fallback',()=>{
  it('allows bounded plain explanation, lists and code, but no model-owned statuses or actions',()=>{
    expect(parseModelReply(model([{type:'paragraph',text:'建议优先处理日期较早的项目。'},{type:'list',items:['第一点']},{type:'code',text:'const count = 1'}]))).toHaveLength(3)
    for(const raw of ['broken','[]',JSON.stringify({version:2,blocks:[]}),JSON.stringify({version:1,blocks:[],status:'completed'}),model([{type:'button',url:'https://example.com'}]),model([{type:'paragraph',text:'x'.repeat(801)}]),model([{type:'list',items:Array(9).fill('x')}]),model([{type:'paragraph',text:'complete=false'}]),model([{type:'paragraph',text:'我已删除文件'}]),model([{type:'paragraph',text:'| UP主 | 标题 |'}]),model([{type:'paragraph',text:'<a href="https://example.com">点我</a>'}])]) expect(parseModelReply(raw)).toBeUndefined()
  })
  it('ignores malformed or legacy tool replies instead of showing raw JSON or tables',()=>{
    const value=finish(receipt('todo.list',[{title:'真实待办',password:'PRIVATE-PASSWORD'}]),'| 待办 | 状态 | complete=false')
    expect(value).toContain('真实待办');expect(value).not.toMatch(/complete=false|\| 待办|PRIVATE-PASSWORD/)
  })
  it('retains validated analysis only for read-only receipts, not invented write claims',()=>{
    const description=model([{type:'paragraph',text:'可以按截止日期安排顺序。'}])
    expect(finish(receipt('todo.list',[{title:'项目'}]),description)).toBe('可以按截止日期安排顺序。')
    expect(finish(receipt('todo.create',{created:true,title:'项目'}),description)).not.toContain('分析说明')
  })
  it('does not change normal conversations or visual-only replies',()=>{
    const session=new ReplySession();session.accept(receipt('companion.set_state',{selected:true}));expect(session.finish('你好。')).toBe('你好。')
  })
  it('gives every registered tool a safe presentation even with unknown fields',()=>{
    for(const tool of registry.definitions()) {
      const value=finish(receipt(tool.name,{credential:'PRIVATE-SECRET',nested:{raw:'PRIVATE-BODY'}},{}))
      expect(value).not.toMatch(/PRIVATE-SECRET|PRIVATE-BODY|credential|nested/)
      if(tool.name!=='companion.set_state') expect(value).toMatch(/^## /)
    }
    const entry=receipt('future.query',{arbitrary:{raw:'PRIVATE-NEW'}})
    entry.definition={name:'future.query',description:'未来查询',capability:'read',risk:'read_only',scope:'none',inputSchema:{type:'object',properties:{}}} satisfies AgentToolDefinition
    expect(finish(entry)).toContain('未来查询');expect(finish(entry)).not.toContain('PRIVATE-NEW')
  })
})

describe('program-owned real outcome semantics',()=>{
  it('distinguishes submitted, prepared, completed, empty, unknown and error',()=>{
    expect(toolPresentation(receipt('task.create',{id:'task-1',status:'queued'})).state).toBe('pending')
    expect(toolPresentation(receipt('task.create',{})).state).toBe('unknown')
    expect(toolPresentation(receipt('operation.propose',{prepared:true,saved:false})).state).toBe('pending')
    expect(toolPresentation(receipt('screen.record_start',{recordingId:'recording-1'})).state).toBe('pending')
    expect(toolPresentation(receipt('computer.takeover',{})).state).toBe('unknown')
    expect(toolPresentation(receipt('computer.takeover',{prepared:true})).state).toBe('pending')
    expect(toolPresentation(receipt('system.open',{opened:true,target:'https://example.com',status:'submitted_to_default_handler'},{target:'https://example.com'})).state).toBe('pending')
    expect(toolPresentation(receipt('system.open',{})).state).toBe('unknown')
    expect(toolPresentation(receipt('todo.create',{created:true})).state).toBe('completed')
    expect(toolPresentation(receipt('todo.list',[])).state).toBe('empty')
    expect(toolPresentation(receipt('todo.create',{created:false})).state).toBe('unknown')
    expect(toolPresentation(receipt('todo.create',null,{},'已取消')).state).toBe('cancelled')
    expect(toolPresentation(receipt('process.run',{exitCode:1})).state).toBe('failed')
    expect(toolPresentation(receipt('process.run',{detached:true})).state).toBe('pending')
    expect(toolPresentation(receipt('process.run',{timedOut:true})).state).toBe('unknown')
  })
  it('does not claim a homework submission to an external website',()=>{
    expect(finish(receipt('assignment.set_submitted',{submitted:true}))).toContain('没有向教务网站提交作业')
    const args={id:'assignment-1',key:'2026-10-12',submitted:true}
    const snapshot={id:args.id,periodKey:args.key,status:'submitted',submittedAt:'2026-10-12T08:00:00Z'}
    expect(toolPresentation(receipt('assignment.set_submitted',snapshot,args)).state).toBe('completed')
    expect(toolPresentation(receipt('assignment.set_submitted',{...snapshot,periodKey:'wrong-period'},args)).state).toBe('unknown')
    expect(toolPresentation(receipt('assignment.set_submitted',{...snapshot,status:'today',submittedAt:undefined},{...args,submitted:false})).state).toBe('completed')
    expect(toolPresentation(receipt('assignment.set_period',{id:args.id,periodKey:args.key,status:'today',date:'2026-10-13'},{id:args.id,key:args.key,date:'2026-10-13'})).state).toBe('completed')
    expect(toolPresentation(receipt('assignment.set_period',{id:args.id,periodKey:args.key,status:'submitted'},{id:args.id,key:args.key,skipped:true})).state).toBe('unknown')
  })
  it('keeps successful steps visible when another step fails and on interrupted completion',()=>{
    const session=new ReplySession();session.accept(receipt('todo.create',{created:true,title:'已加入的待办'}));session.accept(receipt('calendar.create_event',null,{},'读取超时'))
    expect(session.finish()).toContain('## 部分结果');expect(session.finish()).toContain('已加入的待办');expect(session.finish()).toContain('读取超时')
    expect(session.stopped('后续模型失败')).toContain('本轮已停止');expect(session.stopped('后续模型失败')).toContain('已加入的待办')
  })
  it('keeps partial browser coverage distinct from no one streaming, and avoids field exposure',()=>{
    const value=finish(receipt('browser.followed_live',{verified:true,fetchedAtEpochMs:Date.now(),data:{rooms:[],complete:false}}))
    expect(value).toContain('## 部分结果');expect(value).toContain('状态未知');expect(value).not.toContain('complete')
    expect(toolPresentation(receipt('browser.read_page',{verified:true,data:{text:'片段',loading:true}})).state).toBe('partial')
  })
  it('keeps connection and tab preparation out of the final page reply while retaining diagnostics',()=>{
    const session=new ReplySession();session.accept(receipt('browser.status',{enabled:true,paired:true,online:true}));session.accept(receipt('browser.tabs',{verified:true,data:[{title:'邮箱',tabId:7}]}));session.accept(receipt('browser.read_page',{verified:true,data:{title:'邮箱',text:'PRIVATE-RAW-BODY'}}))
    expect(session.finish()).not.toMatch(/浏览器连接检查|已授权网页|PRIVATE-RAW-BODY|未知字段/)
    expect(finish(receipt('browser.status',{enabled:true,paired:true,online:true}))).toContain('还没有读取目标内容')
    const failed=new ReplySession();failed.accept(receipt('browser.status',null,{},'扩展离线'));failed.accept(receipt('browser.read_page',null,{},'读取失败'))
    expect(failed.finish()).toContain('扩展离线')
  })
  it('shows caps and cache metadata instead of presenting samples as a complete source',()=>{
    expect(finish(receipt('todo.list',Array.from({length:20},(_,i)=>({title:`待办${i}`}))))).toContain('展示前 12 项')
    expect(finish(receipt('web.read_page',{title:'测试页面',text:'样本',cached:true,truncated:true}))).toContain('缓存结果')
  })
  it('shows selected public values and search snippets, not arbitrary object fields',()=>{
    const value=finish(receipt('web.read_json',{data:0,url:'https://example.com/data',cached:true,fetchedAtEpochMs:Date.now()}))
    expect(value).toContain('\n\n0');expect(value).toContain('缓存结果');expect(value).toContain('查看来源')
    expect(finish(receipt('web.read_json',{data:{password:'PRIVATE-NESTED'}}))).not.toContain('PRIVATE-NESTED')
    expect(finish(receipt('web.search',[{title:'公开结果',snippet:'返回的摘要',url:'https://example.com/article'}]))).toContain('返回的摘要')
  })
  it('hides credential-bearing error bodies and technical argument schemas',()=>{
    expect(finish(receipt('web.search',null,{},'token=PRIVATE-SECRET'))).not.toContain('PRIVATE-SECRET')
    expect(finish(receipt('chapter.search',null,{},'工具 chapter.search 的参数不符合 schema'))).toContain('参数无效')
  })
})

describe('shared rendering and speech',()=>{
  it('renders an answer-first query naturally with only bounded, validated source links',()=>{
    const value=finish(receipt('web.search',Array.from({length:9},(_,i)=>({title:`来源${i}`,snippet:'不应倾倒的搜索摘要',url:`https://example.com/${i}`}))),JSON.stringify({version:1,blocks:[{type:'paragraph',text:'北京明天预计有雨，出门记得带伞。'}],sourceIds:['s2']}))
    const {container}=render(<CompanionRichText text={value}/>)
    expect(container.textContent).toMatch(/^北京明天预计有雨/)
    expect(container.textContent).not.toMatch(/不应倾倒|本次执行结果|分析说明/)
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.getByRole('link')).toHaveAttribute('href','https://example.com/1')
    expect(toSpokenText(value)).toContain('北京明天预计有雨')
    expect(toSpokenText(value)).not.toContain('https:')
  })
  it('renders long names and title details literally with only safe official actions',()=>{
    const name='[伪链接](https://evil.invalid)\n## 伪标题'
    const value=finish(receipt('browser.followed_live',{verified:true,data:{complete:false,rooms:[{name,title:'**标题**',roomId:123,liveStatus:1}]}}))
    const {container}=render(<CompanionRichText text={value}/> )
    expect(screen.getAllByRole('link')).toHaveLength(1);expect(screen.getByRole('link')).toHaveAttribute('href','https://live.bilibili.com/123')
    expect(container.querySelectorAll('h4')).toHaveLength(1);expect(container.querySelector('.companion-list-detail')).toHaveTextContent('**标题**')
    expect(container.querySelector('.companion-result')).toHaveAttribute('data-result-state','部分结果')
    expect(container.textContent).toContain(name.replace('\n',' '))
  })
  it('does not let a paragraph inject a new list or heading',()=>{
    const value=formatReply({state:'completed',title:'查看内容',blocks:[{type:'text',text:'- 不是新列表'},{type:'text',text:'1. 不是编号'},{type:'text',text:'## 不是标题'}],notes:[]})
    const {container}=render(<CompanionRichText text={value}/> )
    expect(container.querySelectorAll('.companion-list-line')).toHaveLength(0);expect(container.querySelectorAll('h4')).toHaveLength(1)
  })
  it('preserves embedded backticks in code and excludes it and URLs from speech',()=>{
    const code='const example = "```"\nconst value = 1'
    const value=formatReply({state:'completed',title:'代码说明',blocks:[{type:'code',text:code},{type:'list',items:[{title:'A_B*名字',link:{label:'查看来源',url:'https://example.com/'}}]}],notes:[]})
    const {container}=render(<CompanionRichText text={value}/> )
    expect(container.querySelector('pre code')?.textContent).toBe(code)
    expect(toSpokenText(value)).not.toMatch(/const example|https:\/\//)
    expect(toSpokenText(value)).toContain('A_B*名字')
  })
  it('rejects private, credential-bearing and encoded authentication URLs',()=>{
    for(const url of ['http://example.com','https://user:pass@example.com','https://127.0.0.1','https://[::1]/','https://a.local','https://example.com/?token=secret','https://example.com/?%74oken=x','https://example.com/#access_token=x','https://example.com/?redirect=PRIVATE']) expect(safeReplyUrl(url)).toBeUndefined()
    expect(safeReplyUrl('https://example.com/?page=2')).toBe('https://example.com/?page=2')
  })
})
