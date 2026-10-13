import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {ensureTaskPage,performTaskAction,waitTaskPage} from './task-driver.js'
const job={origin:'https://example.com',id:'fixture',tabId:7,targetUrl:'https://example.com/notices'}
let active
beforeEach(()=>{
  active=vi.fn(async()=>{});vi.stubGlobal('chrome',{permissions:{contains:vi.fn(async()=>true)},tabs:{query:vi.fn(async()=>[]),get:vi.fn(async()=>({id:7,url:'https://example.com/notices',status:'complete'})),create:vi.fn(async()=>({id:7,url:'https://example.com/notices'}))},scripting:{executeScript:vi.fn(async()=>[{result:{actionStatus:'dispatched'}}])}})
})
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers()})
describe('bounded exact-site task driver',()=>{
  it('opens the exact authorized entry only when no existing page, and reuses a current page',async()=>{
    expect(await ensureTaskPage(job,active)).toMatchObject([{tabId:7,url:job.targetUrl}]);expect(active).toHaveBeenCalledTimes(2)
    expect(chrome.tabs.create).toHaveBeenCalledWith({url:job.targetUrl,active:true})
    chrome.tabs.query.mockResolvedValue([{id:8,url:'https://example.com/current',title:'已有页面'}])
    await ensureTaskPage(job,active);expect(chrome.tabs.create).toHaveBeenCalledOnce()
  })
  it('does not open ungranted/cross-site/credential/parameter targets or after task cancellation',async()=>{
    for(const targetUrl of ['https://other.example.com/','https://user:pass@example.com/','https://example.com/?token=secret','http://example.com/'])await expect(ensureTaskPage({...job,targetUrl},active)).rejects.toThrow()
    active.mockRejectedValue(new Error('permission'));await expect(ensureTaskPage(job,active)).rejects.toThrow('permission');expect(chrome.tabs.create).not.toHaveBeenCalled()
  })
  it('checks live task and tab before actions, and rejects changed or incognito pages',async()=>{
    await performTaskAction({...job,interaction:{observationId:'a',elementId:'b',operation:'invoke'}},active);expect(active).toHaveBeenCalledOnce()
    chrome.tabs.get.mockResolvedValue({url:'https://other.example.com/'});await expect(performTaskAction(job,active)).rejects.toThrow('tab_changed')
    chrome.tabs.get.mockResolvedValue({url:'https://example.com/',incognito:true});await expect(performTaskAction(job,active)).rejects.toThrow('tab_changed');expect(chrome.scripting.executeScript).toHaveBeenCalledOnce()
  })
  it('waits with an active-task heartbeat and remains bounded',async()=>{
    vi.useFakeTimers();chrome.tabs.get.mockResolvedValue({url:'https://example.com/',status:'loading'})
    const pending=expect(waitTaskPage(job,active)).rejects.toThrow('page_pending');await vi.runAllTimersAsync();await pending;expect(active).toHaveBeenCalledTimes(16)
  })
  it('waits through a new tab placeholder and only returns the committed authorized page',async()=>{
    vi.useFakeTimers();chrome.tabs.create.mockResolvedValue({id:7,url:'chrome://newtab/',pendingUrl:job.targetUrl})
    chrome.tabs.get.mockResolvedValueOnce({id:7,url:'',pendingUrl:job.targetUrl,status:'loading'}).mockResolvedValue({id:7,url:job.targetUrl,status:'complete'})
    const pending=ensureTaskPage(job,active);await vi.runAllTimersAsync()
    expect(await pending).toMatchObject([{tabId:7,url:job.targetUrl}]);expect(chrome.tabs.create).toHaveBeenCalledOnce();expect(chrome.scripting.executeScript).not.toHaveBeenCalled()
  })
  it('stops a cross-site pending redirect or cancellation after creating a tab, without reading it',async()=>{
    chrome.tabs.create.mockResolvedValue({id:7,url:'about:blank',pendingUrl:job.targetUrl})
    chrome.tabs.get.mockResolvedValue({id:7,url:'about:blank',pendingUrl:'https://other.example.com/login',status:'loading'})
    await expect(ensureTaskPage(job,active)).rejects.toThrow('tab_changed');expect(chrome.scripting.executeScript).not.toHaveBeenCalled()
    active.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('permission'))
    await expect(ensureTaskPage(job,active)).rejects.toThrow('permission');expect(chrome.scripting.executeScript).not.toHaveBeenCalled()
  })
})
