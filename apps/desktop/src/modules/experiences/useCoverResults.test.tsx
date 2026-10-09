import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useCoverResults } from './useCoverResults'
import { experienceCovers, type CoverCandidate } from '../../infrastructure/experienceCovers'
vi.mock('../../infrastructure/experienceCovers', () => ({ experienceCovers: { search: vi.fn(), image: vi.fn(), resolveLink: vi.fn() } }))
const candidate = (id: string): CoverCandidate => ({ id, provider:'weread', title:id, creator:'', year:'', sourceUrl:'https://weread.qq.com/', credit:'微信读书' })
describe('cover result lifecycle', () => {
  it('moves a successfully downloaded matching cover ahead of a failed preview after workers finish', async () => {
    const items = ['failed', 'valid', 'wrong'].map(id => ({ ...candidate(id), title: id === 'wrong' ? '猎魔手记' : '狩魔手记', coverUrl: `https://cdn.weread.qq.com/weread/cover/shoumo-${id}.jpg` }))
    vi.mocked(experienceCovers.search).mockResolvedValueOnce(items)
    const file = new File(['fixture'], 'cover.webp', { type: 'image/webp' })
    vi.mocked(experienceCovers.image).mockImplementation(async url => { if (url.includes('failed')) throw new Error('unavailable'); return file })
    const { result } = renderHook(() => useCoverResults())
    await act(async () => result.current.search('weread', 'novel', { title: '狩魔手记', creator: '', year: '' }))
    expect(result.current.results.map(item => item.candidate.id)).toEqual(['valid', 'failed', 'wrong'])
    expect(result.current.results[0].file).toBe(file)
    expect(result.current.results[1].imageError).toBe('封面暂不可用，可以只采用名称')
    expect(result.current.results.every(item => !item.imagePending)).toBe(true)
  })
  it('does not apply an old search after the user clears or changes source', async () => {
    let resolve!: (value: CoverCandidate[]) => void
    vi.mocked(experienceCovers.search).mockReturnValueOnce(new Promise(done => { resolve = done }))
    const { result } = renderHook(() => useCoverResults())
    let request!: Promise<void>
    act(() => { request = result.current.search('weread', 'novel', { title: '旧书', creator: '', year: '' }) })
    act(() => result.current.clear())
    await act(async () => { resolve([candidate('old')]); await request })
    expect(result.current.results).toEqual([])
    expect(result.current.message).toBe('')
    expect(result.current.loading).toBe(false)
  })
  it('keeps metadata usable when a candidate image fails', async () => {
    vi.mocked(experienceCovers.search).mockResolvedValueOnce([{ ...candidate('a'), coverUrl:'https://cdn.weread.qq.com/weread/cover/a.jpg' }])
    vi.mocked(experienceCovers.image).mockRejectedValueOnce(new Error('offline'))
    const { result } = renderHook(() => useCoverResults())
    await act(async () => result.current.search('weread', 'novel', { title: '作品', creator: '', year: '' }))
    await waitFor(() => expect(result.current.results[0].imagePending).toBe(false))
    expect(result.current.results[0]).toMatchObject({ candidate: { title:'a' }, imageError:'封面暂不可用，可以只采用名称' })
  })
})
