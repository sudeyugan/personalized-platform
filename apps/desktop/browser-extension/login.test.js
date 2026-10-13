import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { continueCachedLogin } from './login.js'
const job={kind:'page',origin:'https://mail.example.com',tabId:7,cachedLogin:true,id:'fictional-job'}
let active
beforeEach(()=>{
  vi.useFakeTimers();active=vi.fn(async()=>{})
  vi.stubGlobal('chrome',{permissions:{contains:vi.fn(async()=>true)},tabs:{get:vi.fn(async()=>({url:'https://mail.example.com/login',status:'complete'}))},scripting:{executeScript:vi.fn(async()=>[{result:{status:'ready'}}])}})
})
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals()})
const answer=status=>[{result:{status}}]
describe('cached login is bounded and separate from query completion',()=>{
  it('requires explicit task opt-in and never clicks unfilled/challenged forms',async()=>{
    expect(await continueCachedLogin({...job,cachedLogin:false},active)).toBe('not_allowed');expect(active).not.toHaveBeenCalled()
    for(const state of ['unfilled','needs_user']){chrome.scripting.executeScript.mockResolvedValue(answer(state));expect(await continueCachedLogin(job,active)).toBe(state)}
    expect(chrome.scripting.executeScript.mock.calls.every(([request])=>!request.args.length)).toBe(true)
  })
  it('clicks once, checks live authority, then allows actual page reading without claiming success',async()=>{
    chrome.scripting.executeScript.mockResolvedValueOnce(answer('ready')).mockResolvedValueOnce(answer('submitted')).mockResolvedValue(answer('none'))
    const pending=continueCachedLogin(job,active);await vi.runAllTimersAsync();expect(await pending).toBe('continued')
    expect(chrome.scripting.executeScript.mock.calls.filter(([request])=>request.args[0]===true)).toHaveLength(1)
    expect(active).toHaveBeenCalledTimes(2);expect(JSON.stringify(chrome.scripting.executeScript.mock.calls)).not.toMatch(/connectionCode|password|token/)
  })
  it('does not click after cancellation or navigation between inspection and commit',async()=>{
    active.mockRejectedValue(new Error('permission'));await expect(continueCachedLogin(job,active)).rejects.toThrow('permission');expect(chrome.scripting.executeScript).toHaveBeenCalledOnce()
    active.mockResolvedValue();chrome.tabs.get.mockResolvedValueOnce({url:'https://mail.example.com/login'}).mockResolvedValueOnce({url:'https://mail.example.com/other'})
    await expect(continueCachedLogin(job,active)).rejects.toThrow('tab_changed');expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(2)
  })
  it('stops at an MFA prompt or unresolved login and never submits again',async()=>{
    chrome.scripting.executeScript.mockResolvedValueOnce(answer('ready')).mockResolvedValueOnce(answer('submitted')).mockResolvedValue(answer('needs_user'))
    let pending=continueCachedLogin(job,active);await vi.runAllTimersAsync();expect(await pending).toBe('needs_user')
    chrome.scripting.executeScript.mockClear().mockResolvedValueOnce(answer('ready')).mockResolvedValueOnce(answer('submitted')).mockResolvedValue(answer('ready'))
    pending=continueCachedLogin(job,active);await vi.runAllTimersAsync();expect(await pending).toBe('pending')
    expect(chrome.scripting.executeScript.mock.calls.filter(([request])=>request.args[0]===true)).toHaveLength(1)
  })
  it('never inspects an incognito, revoked or cross-site tab',async()=>{
    chrome.permissions.contains.mockResolvedValue(false);await expect(continueCachedLogin(job,active)).rejects.toThrow('permission')
    chrome.permissions.contains.mockResolvedValue(true);chrome.tabs.get.mockResolvedValue({url:'https://other.example.com/',incognito:false});await expect(continueCachedLogin(job,active)).rejects.toThrow('tab_changed')
    chrome.tabs.get.mockResolvedValue({url:'https://mail.example.com/login',incognito:true});await expect(continueCachedLogin(job,active)).rejects.toThrow('tab_changed');expect(chrome.scripting.executeScript).not.toHaveBeenCalled()
  })
})
