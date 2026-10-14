import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { HomeMoodCard } from './HomeMoodCard'
import { moodOptions } from './moodConfig'
import { moodKinds } from '../../domain/moods'
import { createSeedLibrary, normalizeLibrary } from '../../domain/seed'
import { useLibraryStore } from '../../state/useLibraryStore'
import { createCompanionToolRegistry } from '../companion/agent/tools'

vi.mock('../../infrastructure/libraryRepository',()=>({libraryRepository:{save:vi.fn().mockResolvedValue(undefined)}}))
beforeEach(()=>{useLibraryStore.setState({data:createSeedLibrary()})})

it('replaces the note field with three balanced rows while still requiring exactly five points',()=>{
  const save=vi.fn()
  render(<HomeMoodCard date="2026-10-14" entries={[]} onSave={save} onDelete={vi.fn()}/> )
  fireEvent.click(screen.getAllByRole('button',{name:'记录'})[0])
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(moodOptions.map(item=>item.id)).toEqual(moodKinds)
  expect(moodOptions.map(item=>item.label)).toEqual(['开心','满足','期待','感激','轻松','放松','平静','安心','迷茫','不安','空落','疲惫','孤独','难过','委屈','焦虑','烦躁','生气'])
  for(const name of ['迷茫','轻松','不安','迷茫','轻松'])fireEvent.click(screen.getByRole('button',{name:new RegExp(`^${name}`)}))
  fireEvent.click(screen.getByRole('button',{name:'保存五点心情'}))
  expect(save).toHaveBeenCalledWith({date:'2026-10-14',period:'morning',points:{lost:2,lighthearted:2,uneasy:1}})
  expect(createCompanionToolRegistry().lookup('mood.save')!.definition.inputSchema.properties).not.toHaveProperty('note')
})
it('retains all new points on reload and old notes on editing without accepting new notes',()=>{
  const store=useLibraryStore.getState()
  store.saveMoodEntry({date:'2026-10-14',period:'morning',points:{lost:1,lighthearted:1,uneasy:1,grateful:1,secure:1},note:'不再写入'})
  let library=normalizeLibrary(JSON.parse(JSON.stringify(useLibraryStore.getState().data)))
  expect(library.planner.moodEntries[0].points).toEqual({lost:1,lighthearted:1,uneasy:1,grateful:1,secure:1})
  expect(library.planner.moodEntries[0].note).toBeUndefined()
  library.planner.moodEntries[0].note='历史备注'
  useLibraryStore.setState({data:library})
  store.saveMoodEntry({date:'2026-10-14',period:'morning',points:{wronged:5}})
  library=normalizeLibrary(JSON.parse(JSON.stringify(useLibraryStore.getState().data)))
  expect(library.planner.moodEntries[0].note).toBe('历史备注')
  expect(library.planner.moodEntries[0].points).toEqual({wronged:5})
})
