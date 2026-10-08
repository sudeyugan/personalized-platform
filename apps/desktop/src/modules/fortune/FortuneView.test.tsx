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
    fireEvent.click(screen.getByRole('button', { name: '求今日签' }))
    expect(useLibraryStore.getState().data.fortune?.today).toBeUndefined()
    fireEvent.click(screen.getByRole('button', { name: /轻摇签筒/ }))
    expect(screen.queryByRole('button', { name: /轻摇签筒/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /回到签台/ })).toBeDisabled()
    act(() => vi.advanceTimersByTime(1800))
    expect(screen.getByRole('article', { name: '今日签文' })).toBeInTheDocument()
    const saved = useLibraryStore.getState().data.fortune?.today
    unmount()
    render(<FortuneView />)
    fireEvent.click(screen.getByRole('button', { name: '查看今日签' }))
    expect(screen.getByRole('article', { name: '今日签文' })).toBeInTheDocument()
    expect(useLibraryStore.getState().drawFortune()).toBe(saved)
  })
  it('allows the next day and skips animation for reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    useLibraryStore.getState().drawFortune()
    render(<FortuneView />)
    fireEvent.click(screen.getByRole('button', { name: '查看今日签' }))
    act(() => { vi.setSystemTime(new Date('2026-10-06T12:00:00')); window.dispatchEvent(new Event('focus')) })
    fireEvent.click(screen.getByRole('button', { name: /轻摇签筒/ }))
    expect(screen.getByRole('article', { name: '今日签文' })).toBeInTheDocument()
    expect(useLibraryStore.getState().data.fortune?.today?.date).toBe('2026-10-06')
  })
  it('draws the themes independently without overwriting the old today result', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const original = useLibraryStore.getState().drawFortune()
    render(<FortuneView />)
    for (const name of ['恋爱签', '前程签']) {
      fireEvent.click(screen.getByRole('button', { name: `求${name}` }))
      fireEvent.click(screen.getByRole('button', { name: /轻摇签筒/ }))
      expect(screen.getByRole('article', { name: `${name}文` })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: /回到签台/ }))
    }
    const saved = useLibraryStore.getState().data.fortune
    expect(saved?.today).toBe(original)
    expect(saved?.love?.date).toBe('2026-10-05')
    expect(saved?.future?.date).toBe('2026-10-05')
    expect(useLibraryStore.getState().drawFortune('love')).toBe(saved?.love)
    expect(useLibraryStore.getState().drawFortune('future')).toBe(saved?.future)
    fireEvent.click(screen.getByRole('button', { name: '查看恋爱签' }))
    expect(screen.getByRole('article', { name: '恋爱签文' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /轻摇签筒/ })).not.toBeInTheDocument()
  })
  it('cancels an old ritual at midnight without drawing for the new day', () => {
    vi.setSystemTime(new Date('2026-10-05T23:59:59.500'))
    render(<FortuneView />)
    fireEvent.click(screen.getByRole('button', { name: '求恋爱签' }))
    fireEvent.click(screen.getByRole('button', { name: /轻摇签筒/ }))
    const saved = useLibraryStore.getState().data.fortune?.love
    act(() => vi.advanceTimersByTime(1800))
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /轻摇签筒/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /回到签台/ })).toBeEnabled()
    expect(saved?.date).toBe('2026-10-05')
    expect(useLibraryStore.getState().data.fortune?.love).toBe(saved)
  })
  it('keeps the deliberate draw if closed during animation, with no late redraw', () => {
    const { unmount } = render(<FortuneView />)
    fireEvent.click(screen.getByRole('button', { name: '求前程签' }))
    fireEvent.click(screen.getByRole('button', { name: /轻摇签筒/ }))
    const saved = useLibraryStore.getState().data.fortune?.future
    unmount()
    act(() => vi.advanceTimersByTime(5000))
    render(<FortuneView />)
    fireEvent.click(screen.getByRole('button', { name: '查看前程签' }))
    expect(screen.getByRole('article', { name: '前程签文' })).toBeInTheDocument()
    expect(useLibraryStore.getState().data.fortune?.future).toBe(saved)
  })
})
