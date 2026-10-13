import { describe, expect, it } from 'vitest'
import { createSeedLibrary } from '../../domain/seed'
import { bilibiliBrowserSites } from '../../domain/browser'
import { learned } from '../../domain/operations/fixtures'
import { browserObjective, followedLiveIntent, resolveBrowserTask } from './taskGoal'
import { BrowserQueryFlow, browserPurposeBlock } from './queryFlow'

function companion(sites: string[]) { const data=createSeedLibrary();data.companion.browser={enabled:true,sites};return data.companion }
const envelope=(data:unknown)=>({success:true as const,data:{verified:true,data}})
describe('current task objective and target matrix',()=>{
  it.each(['看看B站我关注的up主最近有更新的是哪一位','B站关注主播有新视频吗','B站关注列表的投稿更新，不要直播','查看哔哩哔哩我的动态'])('does not substitute followed-live for updates: %s',message=>{
    expect(browserObjective(message)).toBe('updates');expect(followedLiveIntent(message)).toBe(false)
    expect(browserPurposeBlock(message,{id:'x',name:'browser.followed_live',arguments:{}})).toContain('不能回答视频更新')
    expect(resolveBrowserTask(message,companion([...bilibiliBrowserSites]))?.clarification).toContain('动态页')
  })
  it.each(['看一下现在B站我关注的up主有谁在开播','B站关注的主播谁在播','查看B站账号的直播列表','现在B站UP主里面，有谁在开播啊？','B站哪些UP主在直播','B站主播谁正在直播'])('allows actual live goals: %s',message=>{
    expect(browserObjective(message)).toBe('followed_live')
    expect(resolveBrowserTask(message,companion([...bilibiliBrowserSites]))?.origins).toEqual(bilibiliBrowserSites)
  })
  it('treats service domains as one aggregate purpose without conflating an individual streamer',()=>{
    const data=companion([...bilibiliBrowserSites,'https://t.bilibili.com','https://www.bilibili.com','https://mail.qq.com'])
    const message='现在B站UP主里面，有谁在开播啊？'
    expect(followedLiveIntent(message)).toBe(true);expect(resolveBrowserTask(message,data)?.origins).toEqual(bilibiliBrowserSites)
    expect(resolveBrowserTask(message,data)?.clarification).toBeUndefined()
    expect(browserObjective('B站天才美少女卡莎开播了没')).not.toBe('followed_live')
    expect(followedLiveIntent('B站某个主播开播了没')).toBe(false)
    expect(browserObjective('B站哪些UP主更新视频了，不要直播')).toBe('updates')
  })
  it.each(['现在B站有up主开播了吗','B站有没有主播正在直播','B站UP主有开播的吗','B站还有主播在播吗','看看哔哩哔哩哪些UP主在直播'])('defaults a quantified live group to the current follow list: %s',message=>{
    expect(followedLiveIntent(message)).toBe(true)
    expect(resolveBrowserTask(message,companion([...bilibiliBrowserSites,'https://www.bilibili.com','https://t.bilibili.com']))?.origins).toEqual(bilibiliBrowserSites)
  })
  it.each(['B站UP主卡莎开播了吗','B站天才美少女卡莎开播了没','B站全站有哪些主播开播','推荐B站正在直播的UP主','不要查询B站有up主开播吗','B站哪些UP主有新视频，不要直播'])('does not reinterpret named/public/negative/update requests as follows: %s',message=>{
    expect(followedLiveIntent(message)).toBe(false)
  })
  it.each(['https://mail.qq.com','https://exmail.qq.com','https://wx.mail.qq.com','https://mail.google.com','https://outlook.live.com','https://outlook.office.com','https://mail.163.com','https://mail.126.com','https://webmail.example.com','https://owa.example.com','https://qiye.aliyun.com','https://mail.proton.me'])('resolves a unique bound mail site, not all authorised sites: %s',site=>{
    const task=resolveBrowserTask('查看一下我的邮箱里有新邮件吗',companion([...bilibiliBrowserSites,'https://github.com',site]))
    expect(task?.origins).toEqual([site]);expect(task?.clarification).toBeUndefined()
  })
  it('requires a mail choice but accepts a brand or exact origin',()=>{
    const data=companion(['https://mail.qq.com','https://outlook.live.com'])
    expect(resolveBrowserTask('检查我的邮箱',data)?.clarification).toContain('哪一个邮箱')
    expect(resolveBrowserTask('查看QQ邮箱有新邮件吗',data)?.origins).toEqual(['https://mail.qq.com'])
    expect(resolveBrowserTask('查查Outlook邮件',data)?.origins).toEqual(['https://outlook.live.com'])
    expect(resolveBrowserTask('查看mail.qq.com的邮件',data)?.origins).toEqual(['https://mail.qq.com'])
    expect(resolveBrowserTask('查看https://mail.qq.com.evil.net邮箱',data)?.origins).toEqual([])
    for(const url of ['http://mail.qq.com','https://user:password@mail.qq.com','https://mail.qq.com:8443'])expect(resolveBrowserTask(`查看${url}邮箱`,data)?.clarification).toContain('HTTPS页面链接')
    expect(resolveBrowserTask('检查邮箱',companion(['https://github.com']))?.origins).toEqual([])
  })
  it('supports arbitrary explicit websites, missing grants and no-op discussion',()=>{
    const data=companion(['https://portal.example.com','https://github.com'])
    expect(resolveBrowserTask('查看portal.example.com我的通知',data)?.origins).toEqual(['https://portal.example.com'])
    expect(resolveBrowserTask('查看GitHub通知',data)?.origins).toEqual(['https://github.com'])
    expect(resolveBrowserTask('查看missing.example.com我的通知',data)?.clarification).toContain('尚未')
    for(const message of ['你好','不要检查邮箱','讨论如何检查我的邮箱','如果让你看B站动态呢']) expect(resolveBrowserTask(message,data)).toBeUndefined()
    expect(resolveBrowserTask('读取https://www.wikipedia.org公开资料',data)).toBeUndefined()
    expect(browserObjective('查询B站客户端更新了什么功能')).not.toBe('updates')
  })
  it('uses the updates UI, and never lets a broad old live method bind another purpose',()=>{
    const data=companion([...bilibiliBrowserSites,'https://www.bilibili.com','https://t.bilibili.com'])
    data.operations=[{...learned(),scope:'browser',pattern:'browser.followed_live@https://live.bilibili.com',keywords:['我关注的up主']}]
    expect(resolveBrowserTask('看看B站我关注的up主最近更新',data)?.origins).toEqual(['https://t.bilibili.com'])
    data.browser!.sites=[...bilibiliBrowserSites]
    expect(resolveBrowserTask('看看B站我关注的up主最近更新',data)?.origins).toEqual([])
  })
  it('reuses a successful mailbox site on a custom hostname without treating unrelated methods as mail',()=>{
    const data=companion(['https://portal.example.com','https://github.com'])
    data.operations=[{...learned(),title:'检查我的邮箱',keywords:['邮箱','新邮件'],scope:'browser',pattern:'browser.tabs|browser.read_page@https://portal.example.com'}]
    expect(resolveBrowserTask('查看一下我的邮箱里有新邮件吗',data)?.origins).toEqual(['https://portal.example.com'])
    data.operations[0].title='检查通知';data.operations[0].keywords=['通知']
    expect(resolveBrowserTask('检查我的邮箱',data)?.origins).toEqual([])
  })
  it('resolves website roles rather than requiring standard hostname patterns, with precise grants',()=>{
    let data=companion(['https://mails.tsinghua.edu.cn'])
    expect(resolveBrowserTask('查看我的邮箱有未读邮件吗',data)?.origins).toEqual(['https://mails.tsinghua.edu.cn'])
    data=companion(['https://portal.example.com','https://inbox.example.com'])
    data.browser!.profiles=[{origin:'https://portal.example.com',role:'portal',label:'学校门户'},{origin:'https://inbox.example.com',role:'mail'}]
    expect(resolveBrowserTask('查看我的学校通知',data)?.origins).toEqual(['https://portal.example.com'])
    expect(resolveBrowserTask('查看我的邮箱有未读邮件吗',data)?.origins).toEqual(['https://inbox.example.com'])
    data.browser!.sites.push('https://shop.example.com');data.browser!.profiles.push({origin:'https://shop.example.com',role:'general',label:'网上商城'})
    expect(resolveBrowserTask('帮我看网上商城的订单',data)?.origins).toEqual(['https://shop.example.com'])
  })
  it('uses only a user-confirmed default role, overridden by a named site or exact URL',()=>{
    const data=companion(['https://mail.qq.com','https://mails.example.com']);data.browser!.preferredSites={mail:'https://mails.example.com'}
    expect(resolveBrowserTask('查看我的邮箱',data)?.origins).toEqual(['https://mails.example.com'])
    expect(resolveBrowserTask('查看QQ邮箱',data)?.origins).toEqual(['https://mail.qq.com'])
    expect(resolveBrowserTask('查看邮箱 https://mail.qq.com/',data)?.origins).toEqual(['https://mail.qq.com'])
    data.browser!.sites=['https://mail.qq.com'];expect(resolveBrowserTask('查看我的邮箱',data)?.origins).toEqual(['https://mail.qq.com'])
  })
})
describe('generic read-only current-page flow',()=>{
  const task={objective:'mail' as const,origins:['https://mail.qq.com'],candidates:['https://mail.qq.com']}
  it('uses the current returned id and stops empty or ambiguous mail pages without guessing',()=>{
    const flow=new BrowserQueryFlow(task,'查看我的邮箱有新邮件吗'),tabs=flow.initialCall!
    expect(tabs).toMatchObject({name:'browser.tabs',arguments:{origin:task.origins[0]}})
    expect(flow.advance(tabs,envelope([{tabId:42}]))?.nextCall).toMatchObject({name:'browser.read_page',arguments:{tabId:42}})
    expect(flow.advance(tabs,envelope([]))?.nextCall).toMatchObject({name:'browser.ensure_page'})
    expect(flow.advance(tabs,envelope([]))?.reply).toContain('目标结果仍未知')
    expect(flow.advance(tabs,envelope([{tabId:42,title:'Inbox',url:'https://mail.qq.com/account1'},{tabId:43,title:'Sent',url:'https://mail.qq.com/account2'}]))?.reply).toContain('多个页面或账号')
    expect(flow.advance(tabs,{success:false,error:{code:'PermissionDenied',message:'撤销'}})?.reply).toContain('没有继续遍历')
  })
  it('uses an explicit page only among returned tabs, and rejects unverified replies',()=>{
    const flow=new BrowserQueryFlow(task,'查看https://mail.qq.com/account2邮箱'),tabs=flow.initialCall!
    expect(flow.advance(tabs,envelope([{tabId:42,url:'https://mail.qq.com/account1'},{tabId:43,url:'https://mail.qq.com/account2'}]))?.nextCall).toMatchObject({arguments:{tabId:43}})
    expect(flow.advance(tabs,{success:true,data:{data:[{tabId:42}]}})?.reply).toContain('无法核验')
  })
})
