import { afterEach,beforeEach,expect,it,vi } from 'vitest'
import { clearRecording,handleRecordingMessage,maintainRecording } from './recording.js'
const origin='https://example.com',id='b'.repeat(64),lease={id,origin,tabId:7,phase:'recording',ttlMs:4500}
let api,fetcher
beforeEach(()=>{
  api={runtime:{id:'reader'},storage:{local:{get:vi.fn(async()=>({connectionCode:'a'.repeat(64),sites:[origin]}))}},permissions:{contains:vi.fn(async()=>true)},tabs:{get:vi.fn(async()=>({url:origin+'/inbox',incognito:false}))},scripting:{executeScript:vi.fn(async()=>[{documentId:'doc1',result:{ready:true}}])},action:{setBadgeText:vi.fn()}}
  fetcher=vi.fn(async()=>({ok:true,json:async()=>({ok:true})}));vi.stubGlobal('chrome',api);vi.stubGlobal('fetch',fetcher)
  api.runtime.getURL=()=> 'chrome-extension://reader/'
})
afterEach(async()=>{await clearRecording();vi.unstubAllGlobals()})
const sender=()=>({id:'reader',frameId:0,tab:{id:7},url:origin+'/inbox',documentId:'doc1'})
const send=(message={},identity=sender())=>new Promise(resolve=>handleRecordingMessage({type:'recording_page',recordingId:id,action:'event',cue:'inbox',...message},identity,resolve))
it('accepts only closed cues from the selected document, posts no page content',async()=>{
  await maintainRecording(lease);expect(await send()).toEqual({accepted:true})
  expect(JSON.parse(fetcher.mock.calls.at(-1)[1].body)).toEqual({recordingId:id,action:'event',cue:'inbox'})
  for(const message of [{cue:'password'},{text:'private'},{action:'stop',cue:'inbox'},{recordingId:'old'}])expect(await send(message)).toEqual({accepted:false})
})
it('rejects other frame/page/extension/document/malformed sender',async()=>{
  await maintainRecording(lease)
  for(const delta of [{frameId:1},{tab:{id:8}},{id:'other'},{url:'https://other.example.com'},{url:'invalid'},{documentId:'old'}])expect(await send({}, {...sender(),...delta})).toEqual({accepted:false})
  expect(fetcher).not.toHaveBeenCalled()
})
it('stops when permission or target page changes and never injects another website',async()=>{
  await maintainRecording(lease);api.tabs.get.mockResolvedValue({url:'https://other.example.com'})
  await maintainRecording(lease);expect(api.scripting.executeScript).toHaveBeenCalledOnce()
  expect(JSON.parse(fetcher.mock.calls.at(-1)[1].body).action).toBe('stop')
  expect(await send()).toEqual({accepted:false})
})
it('rejects invalid leases before injecting or reading inputs',async()=>{
  for(const bad of [{...lease,text:'private'},{...lease,ttlMs:5000},{...lease,origin:'http://example.com'}])await expect(maintainRecording(bad)).rejects.toThrow()
  expect(api.scripting.executeScript).not.toHaveBeenCalled()
})
