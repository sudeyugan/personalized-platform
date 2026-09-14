import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useLiveDate } from './homeDate'

describe('live home date', () => {
  afterEach(() => vi.useRealTimers())

  it('updates the date while the application stays open across midnight', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 8, 23, 59, 45))
    const { result } = renderHook(() => useLiveDate())
    expect(result.current).toMatchObject({ month: '8月', day: '08' })

    act(() => vi.advanceTimersByTime(30_000))

    expect(result.current).toMatchObject({ month: '8月', day: '09' })
  })
})
