import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSeedLibrary, normalizeLibrary } from '../domain/seed'
import { AppLibraryRepository } from '../infrastructure/libraryRepository'
import { useLibraryStore } from './useLibraryStore'
import { method } from '../domain/operations/fixtures'

vi.mock('../infrastructure/libraryRepository', async original => { const actual = await original<typeof import('../infrastructure/libraryRepository')>(); return { ...actual, libraryRepository: { save: vi.fn().mockResolvedValue(undefined) } } })
describe('operation memory storage', () => {
  beforeEach(() => { localStorage.clear(); useLibraryStore.setState({ data: createSeedLibrary(), saveStatus: 'idle' }) })
  it('saves separately without changing text memories or permissions', () => {
    const previous = useLibraryStore.getState().data.companion
    const item = useLibraryStore.getState().saveOperation(method)
    expect(item.revision).toBe(1)
    expect(useLibraryStore.getState().data.companion.permissions).toBe(previous.permissions)
    expect(useLibraryStore.getState().data.companion.memories).toBe(previous.memories)
  })
  it('uses optimistic revisions for edit, enable and delete', () => {
    const store = useLibraryStore.getState(), item = store.saveOperation(method)
    store.saveOperation({ ...method, title: '新版' }, item.id, item.revision)
    expect(() => store.saveOperation(method, item.id, item.revision)).toThrow()
    expect(() => store.deleteOperation(item.id, item.revision)).toThrow()
    store.setOperationEnabled(item.id, 2, false)
    expect(useLibraryStore.getState().data.companion.operations![0]).toMatchObject({ revision: 3, enabled: false })
  })
  it('records only bounded metadata, requires real review records and ignores stale runs', () => {
    const store = useLibraryStore.getState(), item = store.saveOperation(method)
    const id = store.recordOperationRun(item.id, 1, 'awaiting_review', 2)
    store.recordOperationRun(item.id, 1, 'confirmed', 2, id)
    expect(() => store.recordOperationRun(item.id, 1, 'confirmed', 2, id)).toThrow()
    expect(store.recordOperationRun(item.id, 2, 'awaiting_review', 1)).toBeUndefined()
    for (let index = 0; index < 20; index++) store.recordOperationRun(item.id, 1, 'error', 1)
    expect(useLibraryStore.getState().data.companion.operations![0].runs).toHaveLength(10)
  })
  it('round trips through the actual repository and safely upgrades old libraries', async () => {
    const store = useLibraryStore.getState(), item = store.saveOperation(method)
    store.recordOperationRun(item.id, 1, 'cancelled', 1)
    const repository = new AppLibraryRepository(); await repository.save(useLibraryStore.getState().data)
    const restored = normalizeLibrary((await repository.load())!)
    expect(restored.companion.operations).toEqual(useLibraryStore.getState().data.companion.operations)
    expect(normalizeLibrary(createSeedLibrary()).companion.operations).toEqual([])
  })
})
