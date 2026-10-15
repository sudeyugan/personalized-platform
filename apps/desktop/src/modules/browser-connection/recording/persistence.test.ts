import { afterEach,beforeEach,expect,it,vi } from 'vitest'
import { useLibraryStore } from '../../../state/useLibraryStore'
import { waitForMethodSave } from './persistence'
let listener:()=>void,state:ReturnType<typeof useLibraryStore.getState>
beforeEach(()=>{
  state={...useLibraryStore.getState(),saveStatus:'saving',data:{...useLibraryStore.getState().data,companion:{...useLibraryStore.getState().data.companion,operations:[{id:'fixture',revision:1} as never]}}}
  vi.spyOn(useLibraryStore,'getState').mockImplementation(()=>state)
  vi.spyOn(useLibraryStore,'subscribe').mockImplementation(fn=>{listener=()=>fn(state,state);return vi.fn()})
})
afterEach(()=>vi.restoreAllMocks())
it('does not confirm save until local persistence reports saved',async()=>{
  let done=false;const pending=waitForMethodSave('fixture',1,new AbortController().signal).then(()=>{done=true})
  await Promise.resolve();expect(done).toBe(false);state.saveStatus='saved';listener();await pending;expect(done).toBe(true)
})
it('preserves a visible failure rather than treating an optimistic store update as durable',async()=>{
  const pending=waitForMethodSave('fixture',1,new AbortController().signal),assertion=expect(pending).rejects.toThrow('本地保存失败')
  state.saveStatus='error';listener();await assertion
})
it('cancels the wait without claiming an issued save was undone',async()=>{
  const controller=new AbortController(),assertion=expect(waitForMethodSave('fixture',1,controller.signal)).rejects.toThrow('不能撤回')
  controller.abort();await assertion
})
