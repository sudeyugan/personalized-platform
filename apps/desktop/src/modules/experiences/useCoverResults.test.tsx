import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useCoverResults } from './useCoverResults'
import { experienceCovers, type CoverCandidate } from '../../infrastructure/experienceCovers'
vi.mock('../../infrastructure/experienceCovers', () => ({ experienceCovers: { search: vi.fn(), image: vi.fn(), resolveLink: vi.fn() } }))
const candidate = (id: string): CoverCandidate => ({ id, provider:'weread', title:id, creator:'', year:'', sourceUrl:'https://weread.qq.com/', credit:'微信读书' })
describe('cover result lifecycle', () => {
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
