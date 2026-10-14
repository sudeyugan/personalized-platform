import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePetVersionShortcut } from './usePetVersionShortcut'
import { PET_VERSION_REBIND, PET_VERSION_SHORTCUT, PET_VERSION_STATUS, reservedPetShortcutLabel } from './petShortcutKeys'

const native = vi.hoisted(() => ({ register: vi.fn(), unregister: vi.fn(), enabled: false, style: 'pixel', pixel: true, set: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }))
vi.mock('@tauri-apps/plugin-global-shortcut', () => ({ register: native.register, unregister: native.unregister }))
vi.mock('../../../state/useLibraryStore', () => ({ useLibraryStore: { getState: () => ({
  data: { companion: { desktop: { pixelPetEnabled: native.pixel, pixelPetStyle: native.style, pixelEnhancements: { enabled: native.enabled } } } },
  setCompanionPixelEnhancements: native.set,
}) } }))
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); native.enabled = false; native.pixel = true; native.style = 'pixel'
  native.register.mockResolvedValue(undefined); native.unregister.mockResolvedValue(undefined)
  native.set.mockImplementation(({ enabled }) => { native.enabled = enabled })
})
describe('pixel version shortcut ownership', () => {
  it('reserves equivalent A/Q keys, without catching other shortcuts', () => {
    for (const value of ['Alt+Ctrl+A', 'CommandOrControl+Alt+A', 'control+a+alt']) expect(reservedPetShortcutLabel(value)).toContain('2.0')
    expect(reservedPetShortcutLabel('Alt+Ctrl+Q')).toContain('WebM')
    expect(reservedPetShortcutLabel('Control+Shift+A')).toBeUndefined()
  })
  it('switches live preferences once per press; never changes camera consent', async () => {
    localStorage.setItem('yiyu.pixel-pet.camera.v1', JSON.stringify({ enabled: false }))
    const { unmount } = renderHook(() => usePetVersionShortcut('', '', ''))
    await waitFor(() => expect(native.register).toHaveBeenCalledWith(PET_VERSION_SHORTCUT, expect.any(Function)))
    const handler = native.register.mock.calls[0][1]
    act(() => { handler({ state: 'Pressed' }); handler({ state: 'Pressed' }) })
    expect(native.set).toHaveBeenCalledExactlyOnceWith({ enabled: true })
    act(() => { handler({ state: 'Released' }); handler({ state: 'Pressed' }) })
    expect(native.set).toHaveBeenLastCalledWith({ enabled: false })
    expect(JSON.parse(localStorage.getItem('yiyu.pixel-pet.camera.v1')!)).toEqual({ enabled: false })
    unmount(); await waitFor(() => expect(native.unregister).toHaveBeenCalledExactlyOnceWith(PET_VERSION_SHORTCUT))
    act(() => { handler({ state: 'Released' }); handler({ state: 'Pressed' }) })
    expect(native.set).toHaveBeenCalledTimes(2)
  })
  it('does not replace another selected art style or the WebM renderer', async () => {
    const { unmount } = renderHook(() => usePetVersionShortcut('', '', ''))
    await waitFor(() => expect(native.register).toHaveBeenCalled())
    const handler = native.register.mock.calls[0][1]
    native.style = 'chibi'; act(() => handler({ state: 'Pressed' }))
    native.style = 'pixel'; native.pixel = false; act(() => { handler({ state: 'Released' }); handler({ state: 'Pressed' }) })
    expect(native.set).not.toHaveBeenCalled()
    expect(localStorage.getItem(PET_VERSION_STATUS)).toContain('请先启用像素半身')
    unmount(); await waitFor(() => expect(native.unregister).toHaveBeenCalled())
  })
  it('never releases another app binding; retries only on explicit request', async () => {
    native.register.mockRejectedValueOnce(new Error('occupied'))
    const { unmount } = renderHook(() => usePetVersionShortcut('', '', ''))
    await waitFor(() => expect(localStorage.getItem(PET_VERSION_STATUS)).toContain('未能绑定'))
    expect(native.unregister).not.toHaveBeenCalled()
    act(() => window.dispatchEvent(new Event(PET_VERSION_REBIND)))
    await waitFor(() => expect(localStorage.getItem(PET_VERSION_STATUS)).toContain('已启用'))
    unmount(); await waitFor(() => expect(native.unregister).toHaveBeenCalledExactlyOnceWith(PET_VERSION_SHORTCUT))
  })
  it('cleans up a registration that completes after unmount', async () => {
    let finish!: () => void
    native.register.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
    const { unmount } = renderHook(() => usePetVersionShortcut('', '', ''))
    await waitFor(() => expect(native.register).toHaveBeenCalled())
    unmount(); await act(async () => { finish(); await Promise.resolve() })
    await waitFor(() => expect(native.unregister).toHaveBeenCalledExactlyOnceWith(PET_VERSION_SHORTCUT))
  })
})
