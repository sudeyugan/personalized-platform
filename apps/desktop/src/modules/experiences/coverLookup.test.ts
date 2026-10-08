import { describe, expect, it, vi } from 'vitest'
import { automaticCoverProvider, lookupCovers, lookupCoverImage } from './coverLookup'
import { experienceCovers } from '../../infrastructure/experienceCovers'
vi.mock('../../infrastructure/experienceCovers', async original => {
  const actual = await original<typeof import('../../infrastructure/experienceCovers')>()
  return { ...actual, experienceCovers: { ...actual.experienceCovers, hasKey: vi.fn(), search: vi.fn(), image: vi.fn() } }
})
describe('bounded cover reuse', () => {
  it('an empty search is reissued on explicit retry instead of being cached for thirty minutes', async () => {
    vi.mocked(experienceCovers.search).mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'retry', provider: 'bangumi', title: 'Retry title', creator: '', year: '', sourceUrl: 'https://bgm.tv/subject/1', credit: 'Bangumi' }])
    const hints = { title: 'Retry title', creator: '', year: '' }
    expect(await lookupCovers('bangumi', 'anime', hints)).toEqual([])
    expect(await lookupCovers('bangumi', 'anime', hints)).toHaveLength(1)
    expect(experienceCovers.search).toHaveBeenCalledTimes(2)
    vi.mocked(experienceCovers.search).mockClear()
  })
  it('checks only credentials and selects the appropriate catalogue, without a network lookup', async () => {
    vi.mocked(experienceCovers.hasKey).mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    expect(await automaticCoverProvider('novel')).toBe('weread')
    expect(await automaticCoverProvider('novel')).toBe('openlibrary')
    expect(await automaticCoverProvider('film')).toBe('tmdb')
    expect(experienceCovers.search).not.toHaveBeenCalled()
  })
  it('reuses metadata when changing the local year hint, and keeps image caching ephemeral', async () => {
    vi.mocked(experienceCovers.search).mockResolvedValueOnce([{ id: 'one', provider: 'openlibrary', title: 'Unique title', creator: 'Author', year: '2020', sourceUrl: 'https://openlibrary.org/works/OL1W', credit: 'Open Library' }])
    await lookupCovers('openlibrary', 'book', { title: 'Unique title', creator: 'Author', year: '2020' })
    await lookupCovers('openlibrary', 'book', { title: 'Unique title', creator: 'Author', year: '2000' })
    expect(experienceCovers.search).toHaveBeenCalledTimes(1)
    expect(experienceCovers.search).toHaveBeenCalledWith('openlibrary', 'book', 'Unique title', 'Author')
    const file = new File(['small'], 'cover.webp', { type: 'image/webp' })
    vi.mocked(experienceCovers.image).mockResolvedValueOnce(file)
    expect(await lookupCoverImage('https://covers.openlibrary.org/b/id/123-M.jpg')).toBe(file)
    expect(await lookupCoverImage('https://covers.openlibrary.org/b/id/123-M.jpg')).toBe(file)
    expect(experienceCovers.image).toHaveBeenCalledTimes(1)
  })
})
