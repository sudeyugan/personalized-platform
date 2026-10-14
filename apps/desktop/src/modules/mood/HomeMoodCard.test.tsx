import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { HomeMoodCard } from './HomeMoodCard'
import { moodOptions } from './moodConfig'
import { moodKinds } from '../../domain/moods'
import { createSeedLibrary, normalizeLibrary } from '../../domain/seed'
import { useLibraryStore } from '../../state/useLibraryStore'
import { createCompanionToolRegistry } from '../companion/agent/tools'
import { expandMoodPoints, moodSummary, moodGradientStyle } from './moodUtils'
import { reflectionDays, emotionDistribution } from './visualizations/reflectionData'

vi.mock('../../infrastructure/libraryRepository',()=>({libraryRepository:{save:vi.fn().mockResolvedValue(undefined)}}))
beforeEach(()=>{useLibraryStore.setState({data:createSeedLibrary()})})

it('replaces the note field with three balanced rows while still requiring exactly five points',()=>{
  const save=vi.fn()
  render(<HomeMoodCard date="2026-10-14" entries={[]} onSave={save} onDelete={vi.fn()}/> )
  fireEvent.click(screen.getAllByRole('button',{name:'记录'})[0])
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(moodOptions.map(item=>item.id)).toEqual(moodKinds)
  expect(moodOptions.map(item=>item.label)).toEqual(['开心','满足','期待','感激','轻松','放松','平静','厌恶','迷茫','不安','空落','疲惫','孤独','难过','委屈','焦虑','烦躁','生气'])
  for(const name of ['迷茫','轻松','不安','迷茫','轻松'])fireEvent.click(screen.getByRole('button',{name:new RegExp(`^${name}`)}))
  fireEvent.click(screen.getByRole('button',{name:'保存五点心情'}))
  expect(save).toHaveBeenCalledWith({date:'2026-10-14',period:'morning',points:{lost:2,lighthearted:2,uneasy:1}})
  expect(createCompanionToolRegistry().lookup('mood.save')!.definition.inputSchema.properties).not.toHaveProperty('note')
})
it('retains all new points on reload and old notes on editing without accepting new notes',()=>{
  const store=useLibraryStore.getState()
  store.saveMoodEntry({date:'2026-10-14',period:'morning',points:{lost:1,lighthearted:1,uneasy:1,grateful:1,disgusted:1},note:'不再写入'})
  let library=normalizeLibrary(JSON.parse(JSON.stringify(useLibraryStore.getState().data)))
  expect(library.planner.moodEntries[0].points).toEqual({lost:1,lighthearted:1,uneasy:1,grateful:1,disgusted:1})
  expect(library.planner.moodEntries[0].note).toBeUndefined()
  library.planner.moodEntries[0].note='历史备注'
  useLibraryStore.setState({data:library})
  store.saveMoodEntry({date:'2026-10-14',period:'morning',points:{wronged:5}})
  library=normalizeLibrary(JSON.parse(JSON.stringify(useLibraryStore.getState().data)))
  expect(library.planner.moodEntries[0].note).toBe('历史备注')
  expect(library.planner.moodEntries[0].points).toEqual({wronged:5})
})

it('keeps retired reassurance points meaningful in reload, editing, ribbons and bubbles',()=>{
  const library=createSeedLibrary()
  library.planner.moodEntries=[{id:'old-secure',date:'2026-10-13',period:'morning',points:{secure:5},createdAt:'',updatedAt:''}]
  const entry=normalizeLibrary(JSON.parse(JSON.stringify(library))).planner.moodEntries[0]
  expect(entry.points).toEqual({secure:5})
  expect(expandMoodPoints(entry.points)).toEqual(Array(5).fill('secure'))
  expect(moodSummary(entry.points)).toBe('安心 5')
  expect(moodGradientStyle(entry.points).background).toBe('#9cbbb4')
  const days=reflectionDays([entry.date],[entry])
  expect(days[0].total).toBe(5)
  expect(emotionDistribution(days).find(mood=>mood.id==='secure')).toMatchObject({label:'安心',points:5})
  expect(emotionDistribution(days).find(mood=>mood.id==='disgusted')!.points).toBe(0)
  expect(moodOptions.some(mood=>mood.id==='secure')).toBe(false)
})
