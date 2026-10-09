import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSeedLibrary, normalizeLibrary } from '../domain/seed'
import { AppLibraryRepository } from '../infrastructure/libraryRepository'
import { useLibraryStore } from './useLibraryStore'
import { referencedAssetIds } from './assetsSlice'
import type { ExperienceDraft } from '../domain/experiences'

vi.mock('../infrastructure/libraryRepository', async importOriginal => {
  const actual = await importOriginal<typeof import('../infrastructure/libraryRepository')>()
  return { ...actual, libraryRepository: { ...actual.libraryRepository, save: vi.fn().mockResolvedValue(undefined) } }
})
const draft: ExperienceDraft = { category: 'novel', title: '  作品甲  ', creator: '', note: '感想', dateText: '几年前', paperStyle: 'linen', coverAssetId: 'asset-123' }
describe('experiences store', () => {
  beforeEach(() => { localStorage.clear(); useLibraryStore.setState({ data: createSeedLibrary() }) })
  it('saves, updates, ranks and restores a card without losing text or image references', () => {
    const store = useLibraryStore.getState()
    const id = store.saveExperience(draft)
    expect(useLibraryStore.getState().data.experiences?.entries[0].title).toBe('作品甲')
    store.rankExperience(id, 'top')
    store.setExperienceTierLabel('top', '非常喜欢')
    store.trashExperience(id)
    expect(referencedAssetIds(useLibraryStore.getState().data).has('asset-123')).toBe(true)
    store.restoreExperience(id)
    expect(useLibraryStore.getState().data.experiences?.entries[0]).toMatchObject({ note: '感想', dateText: '几年前', tier: 'top', deletedAt: undefined })
    store.saveExperience({ ...draft, title: '更新后的标题' }, id)
    expect(useLibraryStore.getState().data.experiences?.entries).toHaveLength(1)
    expect(useLibraryStore.getState().data.experiences?.tierLabels.top).toBe('非常喜欢')
  })
  it('hides a disabled module without deleting its records', () => {
    const store = useLibraryStore.getState()
    store.saveExperience(draft); store.navigate('experiences'); store.toggleModule('experiences')
    expect(useLibraryStore.getState().data.session.activeView).toBe('home')
    expect(useLibraryStore.getState().data.experiences?.entries).toHaveLength(1)
  })
  it('purges only deleted cards, leaves unrelated cards and shared asset references untouched', async () => {
    const store = useLibraryStore.getState()
    const id = store.saveExperience(draft)
    const other = store.saveExperience({ ...draft, title: '另一部作品' })
    const assets = useLibraryStore.getState().data.assets
    store.permanentlyDeleteExperience(id)
    expect(useLibraryStore.getState().data.experiences?.entries).toHaveLength(2)
    store.trashExperience(id)
    store.permanentlyDeleteExperience(id)
    store.restoreExperience(id)
    expect(useLibraryStore.getState().data.experiences?.entries.map(item => item.id)).toEqual([other])
    expect(referencedAssetIds(useLibraryStore.getState().data).has('asset-123')).toBe(true)
    expect(useLibraryStore.getState().data.assets).toEqual(assets)
    const repository = new AppLibraryRepository()
    await repository.save(useLibraryStore.getState().data)
    expect(normalizeLibrary((await repository.load())!).experiences?.entries.map(item => item.id)).toEqual([other])
  })
  it('round trips collection data through the actual preview repository', async () => {
    useLibraryStore.getState().saveExperience(draft)
    const repository = new AppLibraryRepository()
    await repository.save(useLibraryStore.getState().data)
    const loaded = normalizeLibrary((await repository.load())!)
    expect(loaded.experiences?.entries[0]).toMatchObject({ title: '作品甲', note: '感想', coverAssetId: 'asset-123' })
  })
})
