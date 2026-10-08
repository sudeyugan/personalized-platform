import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HeartRateBadge } from './HeartRateBadge'
import type { CompanionHeartRateInput } from './companionHeartRate'
import type { HeartRateDisplay } from './display'

const events = vi.hoisted(() => ({ callback: undefined as undefined | ((event: { payload: HeartRateDisplay }) => void), stop: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async (_name, callback) => { events.callback = callback; return events.stop }) }))
const payload: HeartRateDisplay = { enabled: true, phase: 'connected', bpm: 72, ageMs: 0 }
describe('one shared child-window heart reading', () => {
  let input: CompanionHeartRateInput
  beforeEach(() => { vi.useFakeTimers(); events.stop.mockClear(); input = { sample: { current: null }, marker: { current: null } } })
  afterEach(() => vi.useRealTimers())
  const send = (value = payload) => act(() => events.callback?.({ payload: value }))
  it('publishes the local marker and fresh sample only for the visible pet', async () => {
    const { rerender, unmount } = render(<HeartRateBadge visible variant="pixel" input={input} />)
    await act(async () => {})
    send(); expect(input.sample.current?.bpm).toBe(72); expect(input.marker.current).not.toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('72')
    rerender(<HeartRateBadge visible variant="webm" input={input} />)
    expect(input.sample.current).toBeNull(); expect(input.marker.current).toBeNull()
    send(); expect(input.sample.current).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('bpm')
    unmount(); expect(events.stop).toHaveBeenCalledOnce()
  })
  it('removes stale numbers and clears the input on hide or disconnect', async () => {
    const { rerender } = render(<HeartRateBadge visible variant="pixel" input={input} />)
    await act(async () => {})
    send({ ...payload, ageMs: 9500 }); act(() => vi.advanceTimersByTime(2000))
    expect(screen.getByRole('status')).not.toHaveTextContent('72')
    send({ ...payload, phase: 'error', bpm: null, ageMs: null }); expect(input.sample.current).toBeNull()
    send(); rerender(<HeartRateBadge visible={false} variant="pixel" input={input} />)
    expect(input.sample.current).toBeNull(); expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
