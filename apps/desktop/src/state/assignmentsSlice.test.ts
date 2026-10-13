import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSeedLibrary, normalizeLibrary } from '../domain/seed'
import { AppLibraryRepository } from '../infrastructure/libraryRepository'
import { useLibraryStore } from './useLibraryStore'
import type { AssignmentDraft } from '../domain/assignments/types'
import { assignmentOccurrences } from '../domain/assignments/dates'

vi.mock('../infrastructure/libraryRepository', async importOriginal => {
  const actual = await importOriginal<typeof import('../infrastructure/libraryRepository')>()
  return { ...actual, libraryRepository: { ...actual.libraryRepository, save: vi.fn().mockResolvedValue(undefined) } }
})
const draft: AssignmentDraft = { title: '  练习  ', subject: '数学', note: '', rule: { repeat: 'weekly', startDate: '2026-10-01', weekdays: [5], time: '18:00' } }
describe('assignment store and persistence', () => {
  beforeEach(() => { localStorage.clear(); useLibraryStore.setState({ data: createSeedLibrary() }) })
  const create = () => { const store = useLibraryStore.getState(), id = store.saveAssignment(draft), assignment = useLibraryStore.getState().data.planner.assignments![0]; return { store, id, assignment, key: `${assignment.rules[0].id}@2026-10-09` } }
  it('adds independent assignments without changing normal todos or holidays', () => {
    const original = useLibraryStore.getState().data.planner
    const { assignment } = create()
    expect(assignment.title).toBe('练习'); expect(useLibraryStore.getState().data.planner.todos).toBe(original.todos)
    expect(useLibraryStore.getState().data.planner.holidayDates).toBe(original.holidayDates)
  })
  it('submits, undoes and resets only the selected period', () => {
    const { store, id, key } = create()
    store.setAssignmentPeriod(id, key, { submittedAt: new Date().toISOString(), date: '2026-10-12' })
    store.setAssignmentPeriod(id, key, { submittedAt: undefined })
    expect(useLibraryStore.getState().data.planner.assignments![0].periods[key].date).toBe('2026-10-12')
    store.removeAssignmentPeriod(id, key)
    expect(useLibraryStore.getState().data.planner.assignments![0].periods).toEqual({})
  })
  it('rejects nonexistent periods, impossible dates and simultaneous submitted/skipped flags', () => {
    const { store, id, key } = create(), snapshot = useLibraryStore.getState().data
    expect(() => store.setAssignmentPeriod(id, 'invalid', {})).toThrow()
    expect(() => store.setAssignmentPeriod(id, key, { date: '2026-02-29' })).toThrow()
    expect(() => store.setAssignmentPeriod(id, key, { skipped: true, submittedAt: new Date().toISOString() })).toThrow()
    expect(useLibraryStore.getState().data).toBe(snapshot)
  })
  it('preserves periods on metadata edits and protects future submissions during rule edits', () => {
    const { store, id, assignment } = create(), future = '2027-10-01', key = `${assignment.rules[0].id}@${future}`
    store.setAssignmentPeriod(id, key, { submittedAt: new Date().toISOString() })
    store.saveAssignment({ ...draft, title: '改名' }, id)
    expect(useLibraryStore.getState().data.planner.assignments![0].periods[key].submittedAt).toBeTruthy()
    expect(() => store.saveAssignment({ ...draft, rule: { ...draft.rule, startDate: future } }, id, true)).toThrow()
    store.saveAssignment({ ...draft, rule: { ...draft.rule, startDate: '2027-10-02', weekdays: [1] } }, id, true)
    const changed = useLibraryStore.getState().data.planner.assignments![0]
    expect(changed.rules[0].endDate).toBe(future); expect(changed.rules).toHaveLength(2)
    expect(changed.periods[key].submittedAt).toBeTruthy()
  })
  it('archives and restores all original periods without deleting data', () => {
    const { store, id, key } = create(); store.setAssignmentPeriod(id, key, { skipped: true }); store.trashAssignment(id, true)
    expect(assignmentOccurrences(useLibraryStore.getState().data.planner.assignments!)).toEqual([])
    store.trashAssignment(id, false)
    expect(useLibraryStore.getState().data.planner.assignments![0].periods[key].skipped).toBe(true)
  })
  it('round trips through the real repository and old libraries normalize safely', async () => {
    const { store, id, key } = create(); store.setAssignmentPeriod(id, key, { date: '2026-10-13', time: null, submittedAt: new Date().toISOString() }); store.trashAssignment(id, true)
    const repository = new AppLibraryRepository(); await repository.save(useLibraryStore.getState().data)
    const loaded = normalizeLibrary((await repository.load())!)
    expect(loaded.planner.assignments).toEqual(normalizeLibrary(useLibraryStore.getState().data).planner.assignments)
    expect(normalizeLibrary(createSeedLibrary()).planner.assignments).toEqual([])
  })
})
