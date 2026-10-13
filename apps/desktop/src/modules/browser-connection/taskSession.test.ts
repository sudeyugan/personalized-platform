import { beforeEach,describe,expect,it,vi } from 'vitest'
import { createSeedLibrary } from '../../domain/seed'
import { prepareBrowserTurn,rememberBrowserTurn,forgetBrowserTurn } from './taskSession'
beforeEach(()=>{forgetBrowserTurn('main');forgetBrowserTurn('desktop');vi.useRealTimers()})
describe('private task slots without private page history',()=>{
  it('continues an ambiguous target clarification, preserving unread purpose but not other channels',()=>{
    const companion=createSeedLibrary().companion;companion.browser={enabled:true,sites:['https://portal.example.com']}
    const first=prepareBrowserTurn('查看我的邮箱有未读邮件吗',companion)
    expect(first.task?.clarification).toBeTruthy();rememberBrowserTurn(first.task,companion,'main',first.message)
    expect(prepareBrowserTurn('就是https://portal.example.com/',companion,'desktop').task).toBeUndefined()
    const second=prepareBrowserTurn('就是https://portal.example.com/',companion)
    expect(second.task?.origins).toEqual(['https://portal.example.com']);expect(second.message).toContain('未读')
    rememberBrowserTurn(second.task,companion,'main',second.message)
    expect(prepareBrowserTurn('继续',companion).task?.origins).toEqual(['https://portal.example.com'])
  })
  it('does not merge precise domains, persist across revoked authority, or carry into unrelated requests',()=>{
    const companion=createSeedLibrary().companion;companion.browser={enabled:true,sites:['https://mail.example.com','https://mails.example.com']}
    let turn=prepareBrowserTurn('查查看我的邮箱 https://mail.example.com/',companion)
    rememberBrowserTurn(turn.task,companion,'main',turn.message)
    turn=prepareBrowserTurn('也就是https://mails.example.com/',companion);expect(turn.task?.origins).toEqual(['https://mails.example.com'])
    rememberBrowserTurn(turn.task,companion,'main',turn.message);companion.browser.enabled=false
    expect(prepareBrowserTurn('继续',companion).task).toBeUndefined()
    companion.browser.enabled=true;rememberBrowserTurn(turn.task,companion,'main',turn.message)
    prepareBrowserTurn('你好',companion);expect(prepareBrowserTurn('继续',companion).task).toBeUndefined()
  })
  it('expires task slots and never remembers credential-bearing questions',()=>{
    vi.useFakeTimers();const companion=createSeedLibrary().companion;companion.browser={enabled:true,sites:['https://mail.example.com']}
    const turn=prepareBrowserTurn('查看我的邮箱 https://mail.example.com/',companion)
    rememberBrowserTurn(turn.task,companion,'main',turn.message);vi.advanceTimersByTime(300001)
    expect(prepareBrowserTurn('继续',companion).task).toBeUndefined()
    rememberBrowserTurn(turn.task,companion,'main','密码=PRIVATE');expect(prepareBrowserTurn('继续',companion).task).toBeUndefined();vi.useRealTimers()
  })
})
