import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSeedLibrary } from '../../domain/seed'
import { useLibraryStore } from '../../state/useLibraryStore'
import { sendCompanionTurn } from '../companion/companionConversation'
import { bilibiliBrowserSites } from '../../domain/browser'
import { learned } from '../../domain/operations/fixtures'
import type { AgentModelRequest } from '../companion/agent/types'
import { createElement } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CompanionPanel } from '../companion/CompanionPanel'
const calls=vi.hoisted(()=>({generate:vi.fn(),native:vi.fn(),privacy:vi.fn((provider:unknown,_options:{trust:{outboundProtection:boolean}})=>provider)}))
vi.mock('./native',()=>({browserNative:calls.native,configureBrowser:vi.fn(async()=>({epoch:3}))}))
vi.mock('../../infrastructure/companionProvider',()=>({createCompanionProvider:()=>({id:'mock',generate:calls.generate,testConnection:async()=>''})}))
vi.mock('../privacy',()=>({createPrivacyProtectedProvider:calls.privacy,protectOutboundText:async(text:string)=>text}))
vi.mock('../../infrastructure/libraryRepository',()=>({libraryRepository:{save:vi.fn(async()=>{})}}))
beforeEach(()=>{
  vi.clearAllMocks();const data=createSeedLibrary();data.companion.browser={enabled:true,sites:[...bilibiliBrowserSites,'https://example.com']};data.settings.trust.externalAiProcessing=true;data.settings.trust.outboundProtection=false
  data.companion.messages=[{id:'fixture-history',role:'user',content:'PRIVATE-OLD-HISTORY',createdAt:new Date().toISOString(),contextSummary:''}];useLibraryStore.setState({data,saveStatus:'idle'})
})
describe('real CompanionTurn browser and automatic learning wiring',()=>{
  it.each(['现在B站UP主里面，有谁在开播啊？','现在B站有up主开播了吗'])('runs aggregate screenshot without guessing among Bilibili service domains: %s',async message=>{
    useLibraryStore.getState().data.companion.browser!.sites.push('https://t.bilibili.com','https://www.bilibili.com')
    calls.native.mockResolvedValue({verified:true,data:{loggedIn:true,rooms:[{uid:1,roomId:12,name:'虚构开播UP',liveStatus:1}],checked:1,total:1,complete:true}})
    const reply=await sendCompanionTurn(message)
    expect(reply).toContain('虚构开播UP');expect(reply).not.toContain('多个目标网站')
    expect(calls.generate).not.toHaveBeenCalled();expect(calls.native.mock.calls[0][1].request.kind).toBe('followed_live')
  })
  it('handles the screenshot request without a model call, auto learns, and never retains private results',async()=>{
    calls.native.mockResolvedValue({verified:true,untrusted:true,privateBrowser:true,origin:'https://live.bilibili.com',fetchedAtEpochMs:Date.now(),data:{loggedIn:true,rooms:[{uid:1,roomId:12,name:'PRIVATE-LIVE-NAME',title:'PRIVATE-LIVE-TITLE',liveStatus:1}],checked:1,total:null,complete:false}})
    const display=vi.fn()
    const result=await sendCompanionTurn('看一下现在B站我关注的up主有谁在开播',{onTransientMessage:display})
    expect(result).toContain('PRIVATE-LIVE-NAME');expect(calls.generate).not.toHaveBeenCalled()
    expect(display.mock.calls.map(([message])=>message.role)).toEqual(['user','companion'])
    expect(display.mock.calls[1][0]).toMatchObject({content:result,localOnly:true})
    const current=useLibraryStore.getState().data.companion
expect(current.messages).toHaveLength(1);expect(current.messages[0]).toMatchObject({id:'fixture-history',content:'PRIVATE-OLD-HISTORY'});expect(JSON.stringify(current.messages)).not.toMatch(/PRIVATE-LIVE|看一下现在B站/);expect(current.operations?.[0]).toMatchObject({source:'automatic',scope:'browser',pattern:'browser.followed_live@https://live.bilibili.com'})
    expect(JSON.stringify([current.operations,current.agentAudit])).not.toMatch(/PRIVATE-LIVE|PRIVATE-OLD/u)
    await sendCompanionTurn('B站关注的up主谁在开播');expect(useLibraryStore.getState().data.companion.operations).toHaveLength(1)
  })
  it('uses the same local reply for an account live-list query without sending or retaining the result',async()=>{
    calls.native.mockResolvedValue({verified:true,untrusted:true,privateBrowser:true,origin:'https://live.bilibili.com',fetchedAtEpochMs:Date.now(),data:{loggedIn:true,rooms:[{uid:1,roomId:12,name:'PRIVATE-MODEL-NAME',title:'PRIVATE-MODEL-TITLE',liveStatus:1}],checked:1,total:null,complete:false}})
    const display=vi.fn(),reply=await sendCompanionTurn('查看B站账号的直播列表',{onTransientMessage:display})
    expect(reply).toContain('PRIVATE-MODEL-NAME');expect(reply).toContain('PRIVATE-MODEL-TITLE')
    expect(reply).toContain('[进入直播间]');expect(reply).not.toContain('complete=false')
    expect(calls.generate).not.toHaveBeenCalled()
    expect(JSON.stringify(calls.generate.mock.calls)).not.toMatch(/PRIVATE-MODEL|PRIVATE-OLD-HISTORY/)
    expect(display.mock.calls.map(([message])=>message.role)).toEqual(['user','companion'])
    const current=useLibraryStore.getState().data.companion
    expect(current.messages).toHaveLength(1);expect(JSON.stringify(current.messages)).not.toMatch(/PRIVATE-MODEL|查看B站账号/)
    expect(JSON.stringify([current.operations,current.agentAudit])).not.toContain('PRIVATE-MODEL')
  })
  it.each(['not_allowed','unfilled','needs_user','pending'])('never asks the model to invent mail results for an unresolved login: %s',async loginState=>{
    const current=useLibraryStore.getState().data.companion;current.browser!.sites.push('https://mail.tsinghua.edu.cn');current.browser!.cachedLoginSites=['https://mail.tsinghua.edu.cn']
    calls.native.mockImplementation(async(_command,args)=>({verified:true,origin:'https://mail.tsinghua.edu.cn',data:args.request.kind==='tabs'?[{tabId:42}]:{loginState,title:'清华邮箱',text:'PRIVATE-LOGIN-TEXT',loading:false,truncated:false}}))
    const reply=await sendCompanionTurn('查看我的邮箱有未读邮件吗，邮箱仅指https://mail.tsinghua.edu.cn/')
    expect(reply).toContain('尚未进入账号页面');expect(reply).not.toContain('已完成');expect(calls.generate).not.toHaveBeenCalled()
    expect(reply).not.toContain('PRIVATE-LOGIN-TEXT');expect(useLibraryStore.getState().data.companion.operations??[]).toHaveLength(0)
  })
  it('continues from cached login with only fresh inbox evidence and does not learn an authentication action',async()=>{
    const current=useLibraryStore.getState().data.companion;current.browser!.sites.push('https://mail.tsinghua.edu.cn');current.browser!.cachedLoginSites=['https://mail.tsinghua.edu.cn']
    calls.native.mockImplementation(async(_command,args)=>({verified:true,origin:'https://mail.tsinghua.edu.cn',data:args.request.kind==='tabs'?[{tabId:42}]:{loginState:'continued',title:'虚构收件箱',text:'未读 2 PRIVATE-INBOX',loading:false,truncated:false}}))
    calls.generate.mockResolvedValueOnce({type:'text',text:JSON.stringify({version:1,blocks:[{type:'paragraph',text:'当前收件箱显示2封未读邮件。'}]})})
    const reply=await sendCompanionTurn('查看我的邮箱有未读邮件吗，邮箱仅指https://mail.tsinghua.edu.cn/')
    expect(reply).toContain('当前收件箱显示2封未读邮件');expect(calls.native.mock.calls[1][1].request.cachedLogin).toBe(true)
    expect(useLibraryStore.getState().data.companion.operations??[]).toHaveLength(0)
    expect(JSON.stringify(useLibraryStore.getState().data.companion.messages)).not.toMatch(/PRIVATE-INBOX|tsinghua/)
  })
  it('passes only fresh browser context to the model, enforces outbound scanning and auto learns no page values',async()=>{
    calls.native.mockImplementation(async(_command,args)=>({verified:true,untrusted:true,privateBrowser:true,origin:'https://example.com',fetchedAtEpochMs:Date.now(),data:args.request.kind==='tabs'?[{tabId:7}]:{text:'PRIVATE-PAGE-TEXT',loading:false,truncated:false}}))
    calls.generate.mockResolvedValueOnce({type:'text',text:JSON.stringify({version:1,blocks:[{type:'paragraph',text:'PRIVATE-CURRENT-ANSWER'}]})})
    expect(await sendCompanionTurn('查看example.com网页')).toContain('PRIVATE-CURRENT-ANSWER')
    const request=calls.generate.mock.calls[0][0] as AgentModelRequest
    expect(request.context.page).toBe('browser-query');expect(request.context.activeWork).toBeUndefined();expect(JSON.stringify(request.messages)).not.toContain('PRIVATE-OLD-HISTORY')
    expect(request.tools.every(tool=>tool.name.startsWith('browser.')||tool.name==='app.capabilities')).toBe(true)
    expect(calls.privacy.mock.calls[0][1].trust.outboundProtection).toBe(true)
    const current=useLibraryStore.getState().data.companion
    expect(current.messages).toHaveLength(1);expect(JSON.stringify(current.messages)).not.toMatch(/PRIVATE-PAGE|PRIVATE-CURRENT|example.com/);expect(current.operations?.[0].pattern).toBe('browser.tabs|browser.read_page@https://example.com')
    expect(JSON.stringify([current.operations,current.agentAudit])).not.toMatch(/PRIVATE-PAGE|PRIVATE-CURRENT|"tabId":/u)
  })
  it('checks the screenshot mail request from the unique binding without guessing sites or ids',async()=>{
    const current=useLibraryStore.getState().data.companion;current.browser!.sites.push('https://webmail.example.com')
    calls.native.mockImplementation(async(_command,args)=>({verified:true,untrusted:true,privateBrowser:true,origin:'https://webmail.example.com',fetchedAtEpochMs:Date.now(),data:args.request.kind==='tabs'?[{tabId:42}]:{text:'收件箱 未读邮件 2 PRIVATE-MAIL-SUBJECT',loading:false,truncated:false}}))
    calls.generate.mockResolvedValueOnce({type:'text',text:JSON.stringify({version:1,blocks:[{type:'paragraph',text:'当前页面显示 2 封未读邮件。'}]})})
    const display=vi.fn(),reply=await sendCompanionTurn('查看一下我的邮箱里有新邮件吗',{onTransientMessage:display})
    expect(reply).toContain('当前页面显示 2 封未读邮件')
    expect(reply).not.toMatch(/没有明确这个网站|浏览器连接检查|已授权网页|本次返回 1 项/)
    const reads=calls.native.mock.calls.map(([,args])=>args?.request).filter(Boolean)
    expect(reads).toEqual([{kind:'tabs',origin:'https://webmail.example.com'},{kind:'page',origin:'https://webmail.example.com',tabId:42}])
    expect(calls.generate).toHaveBeenCalledOnce()
    const request=calls.generate.mock.calls[0][0] as AgentModelRequest
    expect(request.messages.some(message=>message.content.includes('"objective":"mail"'))).toBe(true)
    expect(request.tools.some(tool=>tool.name==='browser.followed_live')).toBe(false)
    expect(display.mock.calls.map(([message])=>message.role)).toEqual(['user','companion'])
    expect(current.messages).toHaveLength(1)
    expect(JSON.stringify([useLibraryStore.getState().data.companion.operations,useLibraryStore.getState().data.companion.agentAudit])).not.toContain('PRIVATE-MAIL-SUBJECT')
  })
  it('asks once for an ambiguous mail binding, without any private read or model request',async()=>{
    useLibraryStore.getState().data.companion.browser!.sites.push('https://mail.qq.com','https://outlook.live.com')
    const reply=await sendCompanionTurn('查看一下我的邮箱里有新邮件吗')
    expect(reply).toContain('哪一个邮箱');expect(calls.native).not.toHaveBeenCalled();expect(calls.generate).not.toHaveBeenCalled()
  })
  it('never turns the screenshot updates request into a learned followed-live lookup',async()=>{
    const data=useLibraryStore.getState().data;data.companion.browser!.sites.push('https://t.bilibili.com')
    data.companion.operations=[{...learned(),scope:'browser',pattern:'browser.followed_live@https://live.bilibili.com',keywords:['我关注的up主']}]
    calls.native.mockImplementation(async(_command,args)=>({verified:true,untrusted:true,privateBrowser:true,origin:'https://t.bilibili.com',fetchedAtEpochMs:Date.now(),data:args.request.kind==='tabs'?[{tabId:32}]:{text:'关注动态 虚构UP 新视频 5分钟前',loading:false,truncated:false}}))
    calls.generate.mockResolvedValueOnce({type:'tool_call',call:{id:'wrong-live',name:'browser.followed_live',arguments:{}}})
    const reply=await sendCompanionTurn('看看B站我关注的up主最近有更新的是哪一位')
    expect(calls.native.mock.calls.map(([,args])=>args?.request?.kind).filter(Boolean)).toEqual(['tabs','page'])
    expect(reply).toContain('不能回答视频更新')
    const request=calls.generate.mock.calls[0][0] as AgentModelRequest
    expect(request.messages.some(message=>message.content.includes('"objective":"updates"'))).toBe(true)
    expect(request.tools.some(tool=>tool.name==='browser.followed_live')).toBe(false)
    expect(data.companion.messages).toHaveLength(1)
  })
  it('answers an updates goal from the current dynamic page rather than an old live method',async()=>{
    const data=useLibraryStore.getState().data;data.companion.browser!.sites.push('https://t.bilibili.com')
    data.companion.operations=[{...learned(),scope:'browser',pattern:'browser.followed_live@https://live.bilibili.com',keywords:['我关注的up主']}]
    calls.native.mockImplementation(async(_command,args)=>({verified:true,untrusted:true,privateBrowser:true,origin:'https://t.bilibili.com',fetchedAtEpochMs:Date.now(),data:args.request.kind==='tabs'?[{tabId:32}]:{text:'关注动态 虚构UP 新视频 5分钟前',loading:false,truncated:false}}))
    calls.generate.mockResolvedValueOnce({type:'text',text:JSON.stringify({version:1,blocks:[{type:'paragraph',text:'当前动态页显示虚构UP在5分钟前更新了视频；这里只覆盖可见动态。'}]})})
    const reply=await sendCompanionTurn('看看B站我关注的up主最近有更新的是哪一位')
    expect(reply).toContain('虚构UP在5分钟前更新');expect(reply).not.toMatch(/浏览器连接检查|正在直播/)
    expect(calls.native.mock.calls.map(([,args])=>args?.request?.kind).filter(Boolean)).toEqual(['tabs','page'])
    expect(calls.generate).toHaveBeenCalledOnce()
    const request=calls.generate.mock.calls[0][0] as AgentModelRequest
    expect(request.messages.some(message=>message.content.includes('pattern:browser.followed_live'))).toBe(false)
    expect(JSON.stringify([data.companion.messages,data.companion.agentAudit,data.companion.operations])).not.toContain('虚构UP')
  })
  it('displays the pending request and final local reply in the real panel without storing them',async()=>{
    let finish!:(value:unknown)=>void
    calls.native.mockReturnValue(new Promise(resolve=>{finish=resolve}))
    const panel=render(createElement(CompanionPanel))
    fireEvent.change(screen.getByRole('textbox',{name:'给伙伴留言'}),{target:{value:'看一下现在B站我关注的up主有谁在开播'}})
    fireEvent.click(screen.getByRole('button',{name:'发送给伙伴'}))
    expect(screen.getByText('看一下现在B站我关注的up主有谁在开播')).toBeInTheDocument()
    await waitFor(()=>expect(calls.native).toHaveBeenCalled())
    await act(async()=>finish({verified:true,fetchedAtEpochMs:Date.now(),data:{loggedIn:true,rooms:[{uid:1,roomId:12,name:'临时主播',liveStatus:1}],checked:1,total:1,complete:true}}))
    await waitFor(()=>expect(screen.getByText(/临时主播/)).toBeInTheDocument())
    expect(screen.queryByRole('button',{name:'中止当前回答'})).not.toBeInTheDocument()
    expect(screen.queryByText('记住')).not.toBeInTheDocument()
    expect(useLibraryStore.getState().data.companion.messages).toHaveLength(1)
    panel.unmount();render(createElement(CompanionPanel))
    expect(screen.queryByText(/临时主播/)).not.toBeInTheDocument();expect(screen.queryByText('已授权浏览器查询（隐私摘要）')).not.toBeInTheDocument();expect(screen.queryByText(/私人网页内容未保存/)).not.toBeInTheDocument();expect(screen.queryByText('记住')).not.toBeInTheDocument();cleanup()
  })
  it.each(['Edge扩展尚未连接','网站没有获得两侧授权','查询超时，请重试'])('shows a local failure instead of leaving an empty response: %s',async(message)=>{
    calls.native.mockRejectedValue(new Error(message))
    render(createElement(CompanionPanel))
    fireEvent.change(screen.getByRole('textbox',{name:'给伙伴留言'}),{target:{value:'B站关注的up主谁在开播'}})
    fireEvent.click(screen.getByRole('button',{name:'发送给伙伴'}))
    await waitFor(()=>expect(screen.getByText(new RegExp(message))).toBeInTheDocument())
    expect(screen.queryByRole('button',{name:'中止当前回答'})).not.toBeInTheDocument()
    expect(useLibraryStore.getState().data.companion.messages).toHaveLength(1)
    expect(calls.generate).not.toHaveBeenCalled();cleanup()
  })
  it('shows the submitted query and error when browser access is disabled',async()=>{
    useLibraryStore.getState().data.companion.browser!.enabled=false
    render(createElement(CompanionPanel))
    fireEvent.change(screen.getByRole('textbox',{name:'给伙伴留言'}),{target:{value:'B站关注的up主谁在开播'}})
    fireEvent.click(screen.getByRole('button',{name:'发送给伙伴'}))
    await waitFor(()=>expect(screen.getByText(/未开启/)).toBeInTheDocument())
    expect(screen.getByText('B站关注的up主谁在开播')).toBeInTheDocument()
    expect(useLibraryStore.getState().data.companion.messages).toHaveLength(1);cleanup()
  })
  it('displays history-off messages once and never retains a late cancelled reply',async()=>{
    const data=useLibraryStore.getState().data;data.settings.trust.retainConversationHistory=false
    calls.generate.mockResolvedValue({type:'text',text:'临时普通回答'})
    const display=vi.fn();await sendCompanionTurn('你好',{onTransientMessage:display})
    expect(display.mock.calls.map(([message])=>message.role)).toEqual(['user','companion'])
    expect(useLibraryStore.getState().data.companion.messages).toHaveLength(1)
    const controller=new AbortController();const cancelledDisplay=vi.fn()
    calls.native.mockImplementation(async()=>{controller.abort();return {verified:true,data:{rooms:[]}}})
    await expect(sendCompanionTurn('B站关注的up主谁在开播',{signal:controller.signal,onTransientMessage:cancelledDisplay})).rejects.toThrow()
    expect(cancelledDisplay.mock.calls.map(([message])=>message.role)).toEqual(['user'])
  })
  it('keeps ordinary retained chat in history without duplicating display-only messages',async()=>{
    calls.generate.mockResolvedValue({type:'text',text:'普通持久回答'})
    const display=vi.fn();await sendCompanionTurn('你好',{onTransientMessage:display})
    expect(display).not.toHaveBeenCalled()
    expect(useLibraryStore.getState().data.companion.messages.slice(-2).map(message=>message.content)).toEqual(['你好','普通持久回答'])
    const panel=render(createElement(CompanionPanel));expect(screen.getByText('普通持久回答')).toBeInTheDocument();panel.unmount()
    render(createElement(CompanionPanel));expect(screen.getByText('普通持久回答')).toBeInTheDocument();cleanup()
    calls.generate.mockClear();calls.generate.mockResolvedValue({type:'text',text:'下一轮普通回答'})
    await sendCompanionTurn('聊聊今天')
    expect(JSON.stringify(calls.generate.mock.calls)).not.toContain('已授权浏览器查询（隐私摘要）')
  })
  it('never forwards stored browser summaries into subsequent ordinary model history',async()=>{
    calls.native.mockResolvedValue({verified:true,data:{loggedIn:true,rooms:[],checked:0,total:0,complete:true}})
    await sendCompanionTurn('现在B站UP主里面，有谁在开播啊？')
    expect(useLibraryStore.getState().data.companion.messages).toHaveLength(1)
    useLibraryStore.getState().data.companion.messages.push({id:'summary-transient-old',role:'companion',content:'本次查询回合已结束。私人网页内容未保存，重新查询可查看最新结果。',localOnly:true,createdAt:new Date().toISOString()})
    calls.generate.mockResolvedValue({type:'text',text:'普通回答'})
    await sendCompanionTurn('你好')
    expect(JSON.stringify(calls.generate.mock.calls)).not.toMatch(/隐私摘要|本次查询回合|现在B站UP主/)
  })
})
