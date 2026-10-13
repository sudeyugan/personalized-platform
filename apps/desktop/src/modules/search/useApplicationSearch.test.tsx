import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSeedLibrary } from '../../domain/seed'
import { useApplicationSearch } from './useApplicationSearch'
import type { ApplicationSearchHit } from './applicationSearch'

afterEach(() => vi.useRealTimers())
describe('search request lifecycle', () => {
  it('does not let an older success replace the new query, including clearing and unmounting', async () => {
    vi.useFakeTimers()
    const pending: ((value: ApplicationSearchHit[]) => void)[] = []
    const search = () => new Promise<ApplicationSearchHit[]>(resolve => pending.push(resolve))
    const data = createSeedLibrary(), newer: ApplicationSearchHit = { id: 'new', group: '章节', title: 'new', excerpt: '', view: 'writing' }
    const hook = renderHook(({ query }) => useApplicationSearch(data, query, true, search), { initialProps: { query: 'old' } })
    act(() => vi.advanceTimersByTime(120)); hook.rerender({ query: 'new' }); act(() => vi.advanceTimersByTime(120))
    await act(async () => pending[1]([newer])); await act(async () => pending[0]([{ ...newer, id: 'old' }]))
    expect(hook.result.current.results).toEqual([newer])
    hook.rerender({ query: 'last' }); act(() => vi.advanceTimersByTime(120)); hook.rerender({ query: '' })
    await act(async () => pending[2]([newer])); expect(hook.result.current.results).toEqual([])
    hook.rerender({ query: 'unmount' }); act(() => vi.advanceTimersByTime(120)); hook.unmount()
    await act(async () => pending[3]([newer]))
  })
  it('ignores old success and failures after query changes, closing or data changes', async () => {
    vi.useFakeTimers()
    const requests: { resolve: (value: ApplicationSearchHit[]) => void; reject: () => void }[] = []
    const search = vi.fn(() => new Promise<ApplicationSearchHit[]>((resolve, reject) => requests.push({ resolve, reject: () => reject(new Error('old')) })))
    const data = createSeedLibrary(), hit: ApplicationSearchHit = { id: 'new', group: '章节', title: 'new', excerpt: '', view: 'writing' }
    const hook = renderHook(({ query, open, data }) => useApplicationSearch(data, query, open, search), { initialProps: { query: 'old', open: true, data } })
    act(() => vi.advanceTimersByTime(120))
    hook.rerender({ query: 'new', open: true, data }); act(() => vi.advanceTimersByTime(120))
    await act(async () => requests[1].resolve([hit]))
    await act(async () => requests[0].reject())
    expect(hook.result.current.results).toEqual([hit]); expect(hook.result.current.error).toBe(false)
    hook.rerender({ query: 'new', open: true, data: { ...data } })
    expect(hook.result.current.results).toEqual([])
    act(() => vi.advanceTimersByTime(120)); hook.rerender({ query: 'new', open: false, data })
    await act(async () => requests[2].resolve([hit]))
    expect(hook.result.current.results).toEqual([])
  })
})
