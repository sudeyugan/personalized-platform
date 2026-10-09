import { describe, expect, it, vi } from 'vitest'
import { automaticCoverProvider, lookupCovers, lookupCoverImage } from './coverLookup'
import { experienceCovers } from '../../infrastructure/experienceCovers'
import { useLibraryStore } from '../../state/useLibraryStore'
vi.mock('../../infrastructure/experienceCovers', async original => {
  const actual = await original<typeof import('../../infrastructure/experienceCovers')>()
  return { ...actual, experienceCovers: { ...actual.experienceCovers, hasKey: vi.fn(), search: vi.fn(), image: vi.fn() } }
})
describe('bounded cover reuse', () => {
  it('explicitly retries incomplete novel metadata instead of caching a missing cover', async () => {
    vi.mocked(experienceCovers.search).mockClear()
    const candidate = { id: 'incomplete', provider: 'webnovel' as const, title: '缺图重查作品', creator: '', year: '', sourceUrl: 'https://www.zongheng.com/detail/123', credit: '纵横' }
    vi.mocked(experienceCovers.search).mockResolvedValueOnce([candidate]).mockResolvedValueOnce([{ ...candidate, coverUrl: 'https://static.zongheng.com/upload/cover/test.jpg' }])
    const hints = { title: candidate.title, creator: '', year: '' }
    expect((await lookupCovers('webnovel', 'novel', hints))[0].coverUrl).toBeUndefined()
    expect((await lookupCovers('webnovel', 'novel', hints))[0].coverUrl).toContain('static.zongheng.com')
    expect(experienceCovers.search).toHaveBeenCalledTimes(2)
    vi.mocked(experienceCovers.search).mockClear()
  })
  it('an empty search is reissued on explicit retry instead of being cached for thirty minutes', async () => {
    vi.mocked(experienceCovers.search).mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'retry', provider: 'bangumi', title: 'Retry title', creator: '', year: '', sourceUrl: 'https://bgm.tv/subject/1', credit: 'Bangumi' }])
    const hints = { title: 'Retry title', creator: '', year: '' }
    expect(await lookupCovers('bangumi', 'anime', hints)).toEqual([])
    expect(await lookupCovers('bangumi', 'anime', hints)).toHaveLength(1)
    expect(experienceCovers.search).toHaveBeenCalledTimes(2)
    vi.mocked(experienceCovers.search).mockClear()
  })
  it('selects the public web-novel catalogue without credentials or a network lookup', async () => {
    expect(await automaticCoverProvider('novel')).toBe('webnovel')
    expect(await automaticCoverProvider('film')).toBe('tmdb')
    expect(experienceCovers.hasKey).not.toHaveBeenCalled()
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
  it('uses the current search settings and does not replay candidates from another provider', async () => {
    vi.mocked(experienceCovers.search).mockClear()
    vi.mocked(experienceCovers.search).mockResolvedValue([{ id: 'configured', provider: 'webnovel', title: '配置检索作品', creator: '', year: '', sourceUrl: 'https://www.qidian.com/book/123/', credit: '起点' }])
    const config = useLibraryStore.getState().data.settings.webSearch
    const hints = { title: '配置检索作品', creator: '', year: '' }
    await lookupCovers('webnovel', 'novel', hints)
    expect(experienceCovers.search).toHaveBeenLastCalledWith('webnovel', 'novel', hints.title, '', config)
    const data = useLibraryStore.getState().data
    const changed = { providerId: 'bing' as const, fallbackToBing: false }
    useLibraryStore.setState({ data: { ...data, settings: { ...data.settings, webSearch: changed } } })
    await lookupCovers('webnovel', 'novel', hints)
    expect(experienceCovers.search).toHaveBeenCalledTimes(2)
    expect(experienceCovers.search).toHaveBeenLastCalledWith('webnovel', 'novel', hints.title, '', changed)
    useLibraryStore.setState({ data })
  })
})
