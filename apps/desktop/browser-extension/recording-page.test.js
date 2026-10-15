import { afterEach,beforeEach,expect,it,vi } from 'vitest'
import { maintainRecordingPage } from './recording-page.js'
const lease={id:'b'.repeat(64),origin:'https://example.com',tabId:7,phase:'recording',ttlMs:4500}
let api,handlers
beforeEach(()=>{
  handlers={};vi.useFakeTimers();api={runtime:{sendMessage:vi.fn(async()=>({accepted:true}))}};vi.stubGlobal('chrome',api)
  const add=document.addEventListener.bind(document)
  vi.spyOn(HTMLElement.prototype,'getClientRects').mockReturnValue([{}])
  vi.spyOn(document,'addEventListener').mockImplementation((type,fn,options)=>{if(['click','submit'].includes(type))handlers[type]=fn;add(type,fn,options)})
  document.body.innerHTML='<button id="inbox">收件箱</button><button id="unknown">A private subject</button><button id="delete">删除</button><form><input type="password"><input type="text"><button>登录</button></form><a href="https://example.com">下一页</a>'
  for(const node of document.querySelectorAll('button,input,form,a')){vi.spyOn(node,'getClientRects').mockReturnValue([{}]);if(node instanceof HTMLInputElement)Object.defineProperty(node,'value',{get:()=>{throw new Error('must never read credentials')},configurable:true})}
  maintainRecordingPage(lease)
})
afterEach(()=>{maintainRecordingPage(null);vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();document.body.innerHTML=''})
const click=(selector,trusted=true)=>handlers.click({isTrusted:trusted,type:'click',target:document.querySelector(selector),composedPath:()=>[]})
it('only returns fixed semantic cues, never control text/input values or href',()=>{
  click('#inbox');click('#unknown');click('input[type=password]');click('form button');click('a')
  expect(api.runtime.sendMessage.mock.calls.map(([m])=>m.cue)).toEqual(['inbox','unknown_button','manual_auth','next'])
  expect(JSON.stringify(api.runtime.sendMessage.mock.calls)).not.toMatch(/private subject|password|value|href|example\.com|text/)
})
it('ignores scripted actions and pauses on a dangerous control',()=>{
  click('#inbox',false);expect(api.runtime.sendMessage).not.toHaveBeenCalled()
  click('#delete');expect(api.runtime.sendMessage).toHaveBeenLastCalledWith({type:'recording_page',recordingId:lease.id,action:'pause'})
})
it('captures login only as a manual-auth placeholder without any credentials',()=>{
  handlers.submit({isTrusted:true,type:'submit',target:document.querySelector('form'),composedPath:()=>[]})
  expect(api.runtime.sendMessage).toHaveBeenLastCalledWith({type:'recording_page',recordingId:lease.id,action:'event',cue:'manual_auth'})
})
it('records repeated navigation but merges the paired click-and-submit form event',()=>{
  click('a');click('a');click('form button')
  handlers.submit({isTrusted:true,type:'submit',target:document.querySelector('form'),composedPath:()=>[]})
  expect(api.runtime.sendMessage.mock.calls.map(([m])=>m.cue)).toEqual(['next','next','manual_auth'])
})
it('pause, short lease expiry and explicit cleanup remove capture',async()=>{
  maintainRecordingPage({...lease,phase:'paused'});click('#inbox');expect(api.runtime.sendMessage).not.toHaveBeenCalled()
  maintainRecordingPage(lease);click('#inbox');expect(api.runtime.sendMessage).toHaveBeenCalledOnce()
  await vi.advanceTimersByTimeAsync(4501);click('#inbox');expect(api.runtime.sendMessage).toHaveBeenCalledOnce()
  expect(document.querySelector('[data-yiyu-recording]')).toBeNull();expect(globalThis.__yiyuRecording).toBeUndefined()
})
it('stops rather than recording silently when the visible notice is removed',()=>{
  document.querySelector('[data-yiyu-recording]').remove();click('#inbox')
  expect(api.runtime.sendMessage).toHaveBeenCalledExactlyOnceWith({type:'recording_page',recordingId:lease.id,action:'stop'})
  expect(globalThis.__yiyuRecording).toBeUndefined()
})
it('fails renewal if the page hides the recording notice',()=>{
  document.querySelector('[data-yiyu-recording]').style.display='none'
  expect(maintainRecordingPage(lease)).toEqual({ready:false})
  expect(api.runtime.sendMessage).toHaveBeenCalledExactlyOnceWith({type:'recording_page',recordingId:lease.id,action:'stop'})
  expect(document.querySelector('[data-yiyu-recording]')).toBeNull()
})
