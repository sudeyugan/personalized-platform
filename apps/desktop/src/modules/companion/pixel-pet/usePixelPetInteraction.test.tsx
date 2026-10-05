import { act, renderHook } from '@testing-library/react'
import type { PointerEvent } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePixelPetInteraction } from './usePixelPetInteraction'

const native = vi.hoisted(() => ({ drag: vi.fn().mockResolvedValue(undefined), emit: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ startDragging: native.drag }) }))
vi.mock('@tauri-apps/api/event', () => ({ emitTo: native.emit }))
const target = { setPointerCapture: vi.fn(), hasPointerCapture: vi.fn().mockReturnValue(true), releasePointerCapture: vi.fn(), getBoundingClientRect: () => ({ left: 20, top: 30, width: 384, height: 480 }) }
const pointer = (x = 0, y = 0, button = 0, id = 1) => ({ clientX: x, clientY: y, button, pointerId: id, currentTarget: target }) as unknown as PointerEvent<HTMLButtonElement>

describe('pixel pet click and native window drag', () => {
  beforeEach(() => { vi.clearAllMocks(); native.drag.mockResolvedValue(undefined) })
  it('opens chat for a click or slight hand movement', () => {
    const { result } = renderHook(usePixelPetInteraction)
    act(() => { result.current.onPointerDown(pointer()); result.current.onPointerMove(pointer(2, 1)); result.current.onPointerUp(pointer(2, 1)) })
    expect(native.drag).not.toHaveBeenCalled()
    expect(native.emit).toHaveBeenCalledExactlyOnceWith('main', 'companion:chat-toggle')
  })
  it('starts native dragging once past the threshold and does not open chat on release', () => {
    const { result } = renderHook(usePixelPetInteraction)
    act(() => {
      result.current.onPointerDown(pointer())
      result.current.onPointerMove(pointer(10, 5))
      result.current.onPointerMove(pointer(20, 10))
      result.current.onPointerUp(pointer(20, 10))
    })
    expect(native.drag).toHaveBeenCalledTimes(1)
    expect(target.releasePointerCapture).toHaveBeenCalledWith(1)
    expect(native.emit).not.toHaveBeenCalled()
  })
  it('ignores right clicks, unrelated pointers and cancelled gestures', () => {
    const { result } = renderHook(usePixelPetInteraction)
    act(() => {
      result.current.onPointerDown(pointer(0, 0, 2)); result.current.onPointerMove(pointer(20)); result.current.onPointerUp(pointer(20))
      result.current.onPointerDown(pointer()); result.current.onPointerMove(pointer(20, 0, 0, 2))
      result.current.onPointerCancel(pointer()); result.current.onPointerUp(pointer())
    })
    expect(native.drag).not.toHaveBeenCalled()
    expect(native.emit).not.toHaveBeenCalled()
  })
  it('responds on clicks and keyboard activation, never on dragging', () => {
    const respond = vi.fn()
    const { result } = renderHook(() => usePixelPetInteraction(respond))
    act(() => { result.current.onPointerDown(pointer()); result.current.onPointerUp(pointer()) })
    expect(respond).toHaveBeenCalledTimes(1)
    act(() => { result.current.onPointerDown(pointer()); result.current.onPointerMove(pointer(20)); result.current.onPointerUp(pointer(20)) })
    expect(respond).toHaveBeenCalledTimes(1)
    act(() => result.current.onClick({ detail: 0 } as Parameters<typeof result.current.onClick>[0]))
    expect(respond).toHaveBeenCalledTimes(2)
  })
  it('passes logical coordinates and allows head taps to consume chat, but never a drag', () => {
    const respond = vi.fn().mockReturnValue(true)
    const { result } = renderHook(() => usePixelPetInteraction(respond))
    act(() => { result.current.onPointerDown(pointer(212, 190)); result.current.onPointerUp(pointer(212, 190)) })
    expect(respond).toHaveBeenCalledExactlyOnceWith({ x: 96, y: 80 })
    expect(native.emit).not.toHaveBeenCalled()
    act(() => { result.current.onPointerDown(pointer(212, 190)); result.current.onPointerMove(pointer(240, 190)); result.current.onPointerUp(pointer(240, 190)) })
    expect(respond).toHaveBeenCalledTimes(1)
  })
  it('reports native drag failures without changing them into clicks', async () => {
    native.drag.mockRejectedValueOnce(new Error('denied'))
    const { result } = renderHook(usePixelPetInteraction)
    await act(async () => { result.current.onPointerDown(pointer()); result.current.onPointerMove(pointer(20)); await Promise.resolve() })
    expect(result.current.error).toBe('拖动暂不可用')
    act(() => result.current.onPointerUp(pointer(20)))
    expect(native.emit).not.toHaveBeenCalled()
  })
})
