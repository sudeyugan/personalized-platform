import { act,cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { afterEach,beforeEach,expect,it,vi } from 'vitest'
import { RecordingReview } from './RecordingReview'
import { useLibraryStore } from '../../../state/useLibraryStore'
import { createSeedLibrary } from '../../../domain/seed'
import type { BrowserRecording } from './types'
const {native,persist}=vi.hoisted(()=>({native:vi.fn(),persist:vi.fn()}))
vi.mock('../native',()=>({browserNative:native}))
vi.mock('./persistence',()=>({waitForMethodSave:persist}))
const record:BrowserRecording={id:'b'.repeat(64),origin:'https://mail.example.com',tabId:7,phase:'review',events:['inbox','unread'],remainingSeconds:120}
let save:ReturnType<typeof vi.spyOn>,finish:()=>void
beforeEach(()=>{
  const data=createSeedLibrary();data.companion.browser={enabled:true,sites:[record.origin]};data.companion.permissions.fullAccess=true
  useLibraryStore.setState({data});native.mockReset();native.mockImplementation(async(name)=>name==='browser_bridge_record_status'?record:null)
  persist.mockReset();persist.mockImplementation(()=>new Promise<void>(resolve=>{finish=resolve}))
  save=vi.spyOn(useLibraryStore.getState(),'saveOperation').mockImplementation((draft,id,revision)=>({...draft,id:id??'saved-fixture',revision:(revision??0)+1,enabled:true,createdAt:'fixture',updatedAt:'fixture',runs:[]}))
})
afterEach(()=>{cleanup();save.mockRestore()})
const confirm=()=>{fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'确认保存方法'}))}
it('requires review and durable save before discarding the preview',async()=>{
  const done=vi.fn();render(<RecordingReview record={record} goal="查看我的邮箱未读" onDone={done}/>)
  expect((screen.getByRole('button',{name:'确认保存方法'}) as HTMLButtonElement).disabled).toBe(true)
  confirm();await waitFor(()=>expect(persist).toHaveBeenCalledOnce());expect(done).not.toHaveBeenCalled()
  expect(native).not.toHaveBeenCalledWith('browser_bridge_record_control',expect.anything())
  await act(async()=>finish());await waitFor(()=>expect(done).toHaveBeenCalledOnce())
})
it('preserves failed previews and retries the same method instead of duplicating',async()=>{
  persist.mockRejectedValueOnce(new Error('fixture save failed')).mockResolvedValueOnce(undefined)
  const done=vi.fn();render(<RecordingReview record={record} goal="查看邮箱" onDone={done}/>)
  confirm();await screen.findByRole('alert');expect(done).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'确认保存方法'}));await waitFor(()=>expect(done).toHaveBeenCalledOnce())
  expect(save.mock.calls[0][1]).toBeUndefined();expect(save.mock.calls[1].slice(1)).toEqual(['saved-fixture',1])
})
it('will not save unknown labels or after website authorization changes',async()=>{
  render(<RecordingReview record={{...record,events:['unknown_button']}} goal="查看网页" onDone={()=>{}}/>)
  confirm();expect(await screen.findByRole('alert')).toHaveTextContent('未知控件');expect(save).not.toHaveBeenCalled()
  cleanup();render(<RecordingReview record={record} goal="查看邮箱" onDone={()=>{}}/>);useLibraryStore.getState().data.companion.browser!.sites=[]
  confirm();expect(await screen.findByRole('alert')).toHaveTextContent('网站授权已变化');expect(save).not.toHaveBeenCalled()
})
