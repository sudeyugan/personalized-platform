import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSeedLibrary } from '../../domain/seed'
import { useLibraryStore } from '../../state/useLibraryStore'
import { FortuneView } from './FortuneView'

vi.mock('../../state/persistence', () => ({ commitLibraryData: (data: unknown, set: (value: unknown) => void) => set({ data }), queueLibrarySave: vi.fn() }))

describe('guest fortune stays ephemeral', () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-05T12:00:00'))
    useLibraryStore.setState({ data: createSeedLibrary() })
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
  const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }))

  it('does not consume an unused daily allowance in any theme', () => {
    render(<FortuneView />)
    const data = useLibraryStore.getState().data
    click('替别人抽')
    for (const name of ['今日签', '恋爱签', '前程签']) {
      click(`求${name}`); click(/轻摇签筒/)
      expect(screen.getByRole('article', { name: `${name}文` })).toHaveTextContent('客签')
      expect(useLibraryStore.getState().data).toBe(data)
      click(/回到签台/)
    }
    click('为自己求签'); click('求今日签')
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    click(/轻摇签筒/)
    expect(useLibraryStore.getState().data.fortune?.today?.date).toBe('2026-10-05')
  })

  it('preserves all personal results and can invite another guest', () => {
    for (const kind of ['daily', 'love', 'future'] as const) useLibraryStore.getState().drawFortune(kind)
    const data = useLibraryStore.getState().data
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(.99)
    render(<FortuneView />)
    click('替别人抽'); click('求恋爱签'); click(/轻摇签筒/)
    expect(screen.getByRole('article')).toHaveTextContent('第 01 签')
    click('再请一位来客')
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    click(/轻摇签筒/)
    expect(screen.getByRole('article')).toHaveTextContent('第 24 签')
    expect(useLibraryStore.getState().data).toBe(data)
    click('为自己求签'); click('查看恋爱签')
    expect(screen.getByRole('article')).not.toHaveTextContent('客签')
    expect(useLibraryStore.getState().data).toBe(data)
  })

  it('locks recipient switching and clears guest animation at midnight', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    vi.setSystemTime(new Date('2026-10-05T23:59:59.500'))
    render(<FortuneView />)
    const data = useLibraryStore.getState().data
    click('替别人抽'); click('求前程签'); click(/轻摇签筒/)
    expect(screen.getByRole('button', { name: '为自己求签' })).toBeDisabled()
    act(() => vi.advanceTimersByTime(1800))
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /轻摇签筒/ })).toBeEnabled()
    expect(useLibraryStore.getState().data).toBe(data)
  })

  it('drops a guest result and all pending callbacks after closing', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    const { unmount } = render(<FortuneView />)
    const data = useLibraryStore.getState().data
    click('替别人抽'); click('求今日签'); click(/轻摇签筒/)
    unmount(); act(() => vi.advanceTimersByTime(5000)); render(<FortuneView />)
    expect(screen.getByRole('button', { name: '为自己求签' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(useLibraryStore.getState().data).toBe(data)
  })
})
