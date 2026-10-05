import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isPetModeShortcut, PET_MODE_SHORTCUT, PET_MODE_STATUS, usePetModeShortcut } from './usePetModeShortcut'

const native = vi.hoisted(() => ({ register: vi.fn(), unregister: vi.fn(), pixel: false, visible: true, toggle: vi.fn(), show: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }))
vi.mock('@tauri-apps/plugin-global-shortcut', () => ({ register: native.register, unregister: native.unregister }))
vi.mock('../../../state/useLibraryStore', () => ({ useLibraryStore: { getState: () => ({
  data: { companion: { desktop: { pixelPetEnabled: native.pixel, visible: native.visible } } },
  setCompanionPixelPet: native.toggle, setCompanionDesktop: native.show,
}) } }))

describe('Ctrl+Alt+Q mode shortcut', () => {
  beforeEach(() => {
    vi.clearAllMocks(); localStorage.clear(); native.pixel = false; native.visible = true
    native.register.mockResolvedValue(undefined); native.unregister.mockResolvedValue(undefined)
    native.toggle.mockImplementation((pixel: boolean) => { native.pixel = pixel; if (pixel) native.visible = true })
    native.show.mockImplementation((visible: boolean) => { native.visible = visible })
  })
  it('recognizes equivalent user shortcuts without confusing other keys', () => {
    for (const value of ['Alt+Ctrl+Q', 'CommandOrControl+Alt+Q', 'control+q+alt']) expect(isPetModeShortcut(value)).toBe(true)
    expect(isPetModeShortcut('Control+Alt+Y')).toBe(false)
  })
  it('toggles live saved mode once per press and releases only its own binding', async () => {
    const switched = vi.fn()
    const { unmount } = renderHook(() => usePetModeShortcut('Control+Alt+Y', 'Control+Alt+T', '', switched))
    await waitFor(() => expect(native.register).toHaveBeenCalledWith(PET_MODE_SHORTCUT, expect.any(Function)))
    const handler = native.register.mock.calls[0][1]
    act(() => { handler({ state: 'Pressed' }); handler({ state: 'Pressed' }) })
    expect(native.toggle).toHaveBeenCalledExactlyOnceWith(true)
    act(() => { handler({ state: 'Released' }); handler({ state: 'Pressed' }) })
    expect(native.toggle).toHaveBeenLastCalledWith(false)
    expect(switched.mock.calls).toEqual([[true], [false]])
    unmount()
    await waitFor(() => expect(native.unregister).toHaveBeenCalledExactlyOnceWith(PET_MODE_SHORTCUT))
    handler({ state: 'Released' }); handler({ state: 'Pressed' })
    expect(native.toggle).toHaveBeenCalledTimes(2)
  })
  it('preserves conflicting visibility, quiet and emergency bindings', async () => {
    const { rerender, unmount } = renderHook(({ bindings }) => usePetModeShortcut(...bindings, vi.fn()), { initialProps: { bindings: ['Alt+Ctrl+Q', '', ''] as [string, string, string] } })
    expect(localStorage.getItem(PET_MODE_STATUS)).toContain('冲突')
    rerender({ bindings: ['', 'CommandOrControl+Alt+Q', ''] })
    rerender({ bindings: ['', '', 'Control+Alt+Q'] })
    unmount()
    await Promise.resolve()
    expect(native.register).not.toHaveBeenCalled()
    expect(native.unregister).not.toHaveBeenCalled()
  })
  it('shows a hidden WebM character when switching out of pixel mode', async () => {
    native.pixel = true; native.visible = false
    const switched = vi.fn()
    const { unmount } = renderHook(() => usePetModeShortcut('', '', '', switched))
    await waitFor(() => expect(native.register).toHaveBeenCalled())
    act(() => native.register.mock.calls[0][1]({ state: 'Pressed' }))
    expect(native.toggle).toHaveBeenCalledWith(false)
    expect(native.show).toHaveBeenCalledWith(true)
    unmount()
    await waitFor(() => expect(native.unregister).toHaveBeenCalled())
  })
  it('cleans up a late registration before binding a replacement', async () => {
    let finish!: () => void
    native.register.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
    const switched = vi.fn()
    const { unmount } = renderHook(() => usePetModeShortcut('', '', '', switched))
    await waitFor(() => expect(native.register).toHaveBeenCalled())
    unmount()
    expect(native.unregister).not.toHaveBeenCalled()
    await act(async () => { finish(); await Promise.resolve() })
    await waitFor(() => expect(native.unregister).toHaveBeenCalledExactlyOnceWith(PET_MODE_SHORTCUT))
  })
  it('reports native registration errors without touching another application binding', async () => {
    native.register.mockRejectedValueOnce(new Error('already registered'))
    const switched = vi.fn()
    const { unmount } = renderHook(() => usePetModeShortcut('', '', '', switched))
    await waitFor(() => expect(localStorage.getItem(PET_MODE_STATUS)).toContain('注册失败'))
    unmount()
    await Promise.resolve()
    expect(native.unregister).not.toHaveBeenCalled()
  })
})
