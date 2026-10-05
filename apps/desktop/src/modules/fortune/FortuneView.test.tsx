import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSeedLibrary } from '../../domain/seed'
import { useLibraryStore } from '../../state/useLibraryStore'
import { FortuneView } from './FortuneView'
vi.mock('../../state/persistence', () => ({ commitLibraryData: (data: unknown, set: (value: unknown) => void) => set({ data }), queueLibrarySave: vi.fn() }))
describe('fortune ritual', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-05T12:00:00'))
    useLibraryStore.setState({ data: createSeedLibrary() })
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
  it('locks the draw during animation and restores the same paper after reopening', () => {
    const { unmount } = render(<FortuneView />)
    fireEvent.click(screen.getByRole('button', { name: /轻摇签筒/ }))
    expect(screen.queryByRole('button', { name: /轻摇签筒/ })).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1800))
    expect(screen.getByRole('article', { name: '今日签文' })).toBeInTheDocument()
    const saved = useLibraryStore.getState().data.fortune?.today
    unmount()
    render(<FortuneView />)
    expect(screen.getByRole('article', { name: '今日签文' })).toBeInTheDocument()
    expect(useLibraryStore.getState().drawFortune()).toBe(saved)
  })
  it('allows the next day and skips animation for reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    useLibraryStore.getState().drawFortune()
    render(<FortuneView />)
    act(() => { vi.setSystemTime(new Date('2026-10-06T12:00:00')); window.dispatchEvent(new Event('focus')) })
    fireEvent.click(screen.getByRole('button', { name: /轻摇签筒/ }))
    expect(screen.getByRole('article', { name: '今日签文' })).toBeInTheDocument()
    expect(useLibraryStore.getState().data.fortune?.today?.date).toBe('2026-10-06')
  })
})
