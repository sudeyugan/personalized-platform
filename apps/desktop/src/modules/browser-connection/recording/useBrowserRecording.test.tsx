import { act,cleanup,renderHook,waitFor } from '@testing-library/react'
import { afterEach,beforeEach,expect,it,vi } from 'vitest'
import { useBrowserRecording } from './useBrowserRecording'
import { useLibraryStore } from '../../../state/useLibraryStore'
import { createSeedLibrary } from '../../../domain/seed'
const mock=vi.hoisted(()=>({native:vi.fn(),configure:vi.fn()}))
vi.mock('../native',()=>({browserNative:mock.native,configureBrowser:mock.configure}))
const origin='https://mail.example.com',record={id:'b'.repeat(64),origin,tabId:7,phase:'recording',events:[],remainingSeconds:299}
beforeEach(()=>{
  vi.stubGlobal('__TAURI_INTERNALS__',{});mock.native.mockReset();mock.configure.mockResolvedValue({epoch:3})
  const data=createSeedLibrary();data.companion.browser={enabled:true,sites:[origin]};data.companion.permissions.fullAccess=true;data.settings.trust.externalAiProcessing=false;useLibraryStore.setState({data})
  mock.native.mockImplementation(async name=>name==='browser_bridge_record_status'?null:name==='browser_bridge_request'?{verified:true,data:[{origin,tabId:7,title:'Fictional mailbox',url:origin+'/inbox'}]}:name==='browser_bridge_record_begin'?record:null)
})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
it('requires explicit page choice, allows local capture with AI off, and cancels on leaving',async()=>{
  const {result,unmount}=renderHook(useBrowserRecording)
  await act(async()=>{await result.current.begin(origin,7)});expect(result.current.error).toContain('请选择');expect(mock.native).not.toHaveBeenCalledWith('browser_bridge_record_begin',expect.anything())
  await act(async()=>{await result.current.findPages(origin)});expect(result.current.tabs).toHaveLength(1)
  await act(async()=>{await result.current.begin(origin,7)});expect(result.current.record?.id).toBe(record.id)
  unmount();expect(mock.native).toHaveBeenCalledWith('browser_bridge_record_control',{recordingId:record.id,action:'cancel'})
})
it('cancels a late begin after leaving rather than orphaning capture',async()=>{
  const {result,unmount}=renderHook(useBrowserRecording);await act(async()=>{await result.current.findPages(origin)})
  let finish!:(value:unknown)=>void;mock.native.mockImplementation(name=>name==='browser_bridge_record_begin'?new Promise(resolve=>{finish=resolve}):Promise.resolve(null))
  let pending!:Promise<void>;act(()=>{pending=result.current.begin(origin,7)});await waitFor(()=>expect(finish).toBeTypeOf('function'));unmount();finish(record);await pending
  expect(mock.native).toHaveBeenCalledWith('browser_bridge_record_control',{recordingId:record.id,action:'cancel'})
})
it('refuses changed authorizations or a different page in a late response',async()=>{
  const {result}=renderHook(useBrowserRecording);await act(async()=>{await result.current.findPages(origin)})
  mock.native.mockImplementation(async name=>{if(name==='browser_bridge_record_begin'){useLibraryStore.getState().data.companion.browser!.sites=[];return record}return null})
  await act(async()=>{await result.current.begin(origin,7)});expect(result.current.error).toContain('设置已变化');expect(result.current.record).toBeNull()
  expect(mock.native).toHaveBeenCalledWith('browser_bridge_record_control',{recordingId:record.id,action:'cancel'})
})
