import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCompanionPlacement } from './useCompanionPlacement'
const native = vi.hoisted(() => ({ moved: undefined as undefined | (() => void), stop: vi.fn(), emit: vi.fn() }))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ onMoved: vi.fn((fn: () => void) => { native.moved = fn; return Promise.resolve(native.stop) }) }) }))
vi.mock('@tauri-apps/api/event', () => ({ emitTo: native.emit }))
describe('central companion move/drag lifecycle', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); native.emit.mockResolvedValue(undefined) })
  afterEach(() => vi.useRealTimers())
  function fixture() {
    const layout = { scale: 1, pixelRatio: 1, ready: true, side: 'bottom-edge' as const }
    const controller = { apply: vi.fn(), settle: vi.fn().mockResolvedValue(layout) }
    const setLayout = vi.fn()
    return { controller, setLayout }
  }
  it('remembers a settled move, but never snaps while a native drag is held', async () => {
    const { controller, setLayout } = fixture()
    const { result } = renderHook(() => useCompanionPlacement(controller, setLayout, true))
    act(() => { result.current.onDragStart(); native.moved?.() })
    await act(async () => vi.advanceTimersByTimeAsync(500))
    expect(controller.settle).not.toHaveBeenCalled()
    await act(async () => result.current.onDragEnd())
    expect(controller.settle).toHaveBeenCalledExactlyOnceWith(true)
    expect(setLayout).toHaveBeenCalledWith(expect.objectContaining({ side: 'bottom-edge' }))
    expect(native.emit).toHaveBeenCalledWith('main', 'companion:pet-side', { side: 'bottom-edge' })
    expect(native.emit).toHaveBeenCalledWith('main', 'companion:moved')
  })
  it('does not sync a pose after normal movement or errors, and ignores movement before snapshot', async () => {
    const { controller, setLayout } = fixture()
    const { result, rerender } = renderHook(({ enabled }) => useCompanionPlacement(controller, setLayout, enabled), { initialProps: { enabled: false } })
    act(() => native.moved?.())
    await act(async () => vi.advanceTimersByTimeAsync(400))
    expect(controller.settle).not.toHaveBeenCalled()
    rerender({ enabled: true })
    act(() => native.moved?.())
    await act(async () => vi.advanceTimersByTimeAsync(400))
    expect(controller.settle).toHaveBeenCalledWith(false)
    await act(async () => { result.current.onDragStart(); result.current.onDragError() })
    expect(native.emit).not.toHaveBeenCalledWith('main', 'companion:pet-side', expect.anything())
  })
  it('cleans up pending correction and prevents a late native result updating an unmounted renderer', async () => {
    const { controller, setLayout } = fixture()
    let resolve!: (value: { scale: number; pixelRatio: number; ready: boolean }) => void
    controller.settle.mockImplementation(() => new Promise(r => { resolve = r }))
    const { result, unmount } = renderHook(() => useCompanionPlacement(controller, setLayout, true))
    await act(async () => { await Promise.resolve(); result.current.onDragEnd() })
    unmount()
    await act(async () => resolve({ scale: 1, pixelRatio: 1, ready: false }))
    expect(setLayout).not.toHaveBeenCalled(); expect(native.emit).not.toHaveBeenCalled()
    expect(native.stop).toHaveBeenCalledTimes(1)
  })
})
