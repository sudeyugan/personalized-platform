import { expect,it } from 'vitest'
import { recordingDraft } from './method'
import { isBrowserRecording } from './validation'
import { validateOperationDraft,methodInstruction } from '../../../domain/operations/method'
import { resolveBrowserTask } from '../taskGoal'
import { createSeedLibrary,normalizeLibrary } from '../../../domain/seed'
import { AppLibraryRepository } from '../../../infrastructure/libraryRepository'
import { learned } from '../../../domain/operations/fixtures'
import type { BrowserRecording } from './types'
const record:BrowserRecording={id:'b'.repeat(64),origin:'https://mail.example.com',tabId:7,phase:'review',events:['inbox','unread','manual_auth','unknown_button'],remainingSeconds:120}
it('creates only editable semantic instructions; no old coordinates, observation or page identity',()=>{
  const draft=validateOperationDraft(recordingDraft(record,'查看我的邮箱未读'))
  expect(draft.scope).toBe('browser');expect(draft.steps).toHaveLength(5)
  expect(draft.goal).toContain(record.origin);expect(JSON.stringify(draft)).not.toMatch(/tabId|recordingId|observationId|elementId|"x":|password|private subject/)
  const data=createSeedLibrary();data.companion.browser={enabled:true,sites:[record.origin]}
  // Execute using the isolated goal, not the safety prose in the instruction.
  expect(resolveBrowserTask(draft.goal,data.companion)).toMatchObject({objective:'mail',origins:[record.origin]})
  expect(resolveBrowserTask(methodInstruction(draft),data.companion)?.clarification).toBeUndefined()
})
it('strictly validates RAM metadata, seven cues maximum, no body fields',()=>{
  expect(isBrowserRecording(record)).toBe(true)
  for(const bad of [{...record,text:'private'},{...record,id:'old'},{...record,events:['password']},{...record,events:Array(8).fill('inbox')},{...record,remainingSeconds:301}])expect(isBrowserRecording(bad)).toBe(false)
})
it('keeps the final eight-step method valid when the event cap is reached',()=>{
  expect(validateOperationDraft(recordingDraft({...record,events:['inbox','unread','all','notifications','updates','following','next']},'查看邮箱')).steps).toHaveLength(8)
})
it('round trips a recorded browser method alongside an older method without schema changes',async()=>{
  localStorage.clear();const data=createSeedLibrary(),old=learned(),draft=validateOperationDraft(recordingDraft(record,'查看我的邮箱未读'))
  const recorded={...draft,id:'operation-recorded-fixture',revision:1,enabled:true,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),runs:[]}
  data.companion.operations=[old,recorded]
  const repository=new AppLibraryRepository();await repository.save(data)
  const restored=normalizeLibrary((await repository.load())!)
  expect(restored.companion.operations).toEqual([old,recorded]);expect(JSON.stringify(restored.companion.operations)).not.toContain(record.id)
})
