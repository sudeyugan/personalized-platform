import { beforeEach, describe, expect, it } from 'vitest'
import { createSeedLibrary } from '../domain/seed'
import { AppLibraryRepository } from './libraryRepository'

describe('AppLibraryRepository browser fallback', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips a versioned library', async () => {
    const repository = new AppLibraryRepository()
    const data = createSeedLibrary()
    await repository.save(data)
    expect(await repository.load()).toEqual(data)
  })

  it('does not crash on corrupted preview data', async () => {
    localStorage.setItem('yiyu.library.preview.v1', '{broken')
    const repository = new AppLibraryRepository()
    expect(await repository.load()).toBeNull()
  })

  it('increments the browser revision for serialized saves', async () => {
    const repository = new AppLibraryRepository()
    const data = createSeedLibrary()
    await repository.save(data)
    await repository.save({ ...data, people: [] })
    const stored = JSON.parse(localStorage.getItem('yiyu.library.preview.v1') ?? '{}')
    expect(stored.revision).toBe(2)
    expect(stored.data.people).toEqual([])
  })

  it('loads the legacy unwrapped browser format', async () => {
    const data = createSeedLibrary()
    localStorage.setItem('yiyu.library.preview.v1', JSON.stringify(data))
    const repository = new AppLibraryRepository()
    expect(await repository.load()).toEqual(data)
  })
})
