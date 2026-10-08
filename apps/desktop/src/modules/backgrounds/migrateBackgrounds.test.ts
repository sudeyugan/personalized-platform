import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSeedLibrary } from '../../domain/seed'
import { useLibraryStore } from '../../state/useLibraryStore'
import { migrateBackgrounds } from './migrateBackgrounds'

describe('background migration', () => {
  const source = 'data:image/png;base64,aGVsbG8='
  beforeEach(() => {
    vi.restoreAllMocks()
    const data = createSeedLibrary(); data.settings.backgrounds.images = { default: source, daily: source }
    useLibraryStore.setState({ data })
  })
  it('stores identical legacy images only once and replaces slots with one reference', async () => {
    const importer = vi.spyOn(useLibraryStore.getState(), 'importAsset').mockResolvedValue({ id: 'bg', purpose: 'background', fileName: 'old.png', mimeType: 'image/png', size: 5, sha256: '', width: 1, height: 1, chapterIds: [], createdAt: '' })
    await migrateBackgrounds()
    expect(importer).toHaveBeenCalledTimes(1)
    expect(useLibraryStore.getState().data.settings.backgrounds.images).toEqual({ default: 'asset:bg', daily: 'asset:bg' })
  })
  it('keeps every original if storing the image fails', async () => {
    vi.spyOn(useLibraryStore.getState(), 'importAsset').mockRejectedValue(new Error('disk full'))
    await expect(migrateBackgrounds()).rejects.toThrow()
    expect(useLibraryStore.getState().data.settings.backgrounds.images.default).toBe(source)
    expect(useLibraryStore.getState().data.settings.backgrounds.images.daily).toBe(source)
  })
})
