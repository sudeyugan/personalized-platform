import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cursorPosition, getCurrentWindow } from '@tauri-apps/api/window'
import { usePixelPetPointer } from './usePixelPetPointer'

vi.mock('@tauri-apps/api/window', () => ({ cursorPosition: vi.fn(), getCurrentWindow: vi.fn() }))
describe('pixel pet native cursor lifecycle', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); document.querySelectorAll('canvas').forEach((node) => node.remove()) })
  it('uses native screen coordinates and stops polling when hidden or unmounted', async () => {
    vi.useFakeTimers()
    vi.mocked(cursorPosition).mockResolvedValue({ x: 120, y: 240 } as Awaited<ReturnType<typeof cursorPosition>>)
    vi.mocked(getCurrentWindow).mockReturnValue({
      innerPosition: vi.fn().mockResolvedValue({ x: 100, y: 200 }),
      scaleFactor: vi.fn().mockResolvedValue(2),
    } as unknown as ReturnType<typeof getCurrentWindow>)
    const canvas = document.createElement('canvas')
    canvas.className = 'pixel-pet-canvas'; document.body.appendChild(canvas)
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 192, height: 240 } as DOMRect)
    const { result, rerender, unmount } = renderHook(({ active }) => usePixelPetPointer(active), { initialProps: { active: true } })
    await act(async () => { await vi.advanceTimersByTimeAsync(60) })
    expect(result.current.pointer.current).toEqual({ x: 10, y: 20 })
    rerender({ active: false })
    const calls = vi.mocked(cursorPosition).mock.calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(cursorPosition).toHaveBeenCalledTimes(calls)
    expect(result.current.pointer.current).toBeNull()
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('reports unavailable native tracking rather than pretending to use screen coordinates', async () => {
    vi.useFakeTimers()
    vi.mocked(getCurrentWindow).mockReturnValue({
      innerPosition: vi.fn().mockRejectedValue(new Error('denied')), scaleFactor: vi.fn().mockResolvedValue(1),
    } as unknown as ReturnType<typeof getCurrentWindow>)
    const { result, unmount } = renderHook(() => usePixelPetPointer(true))
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(result.current.error).toBe('屏幕视线追踪暂不可用')
    expect(result.current.pointer.current).toBeNull()
    unmount()
  })
})
