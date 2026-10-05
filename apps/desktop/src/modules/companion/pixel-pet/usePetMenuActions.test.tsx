import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePetMenuActions } from './usePetMenuActions'
const app = vi.hoisted(() => ({
  enabled: true, listener: undefined as undefined | ((event: { payload: unknown }) => void),
  stop: vi.fn(), style: vi.fn(), side: vi.fn(), desktop: vi.fn(), navigate: vi.fn(),
  show: vi.fn().mockResolvedValue(undefined), focus: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn((_name, listener) => { app.listener = listener; return Promise.resolve(app.stop) }) }))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ show: app.show, setFocus: app.focus }) }))
vi.mock('../../../state/useLibraryStore', () => ({ useLibraryStore: { getState: () => ({
  data: { companion: { desktop: { pixelPetEnabled: app.enabled } } },
  setCompanionPetStyle: app.style, setCompanionPetSide: app.side, setCompanionDesktop: app.desktop, navigate: app.navigate,
}) } }))
describe('main-window bounded pet menu bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks(); app.enabled = true
    Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} })
  })
  afterEach(() => { delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ })
  it('uses the latest mode and known Store actions, rejecting arbitrary requests', async () => {
    const { unmount } = renderHook(usePetMenuActions)
    await act(async () => { await Promise.resolve() })
    act(() => {
      app.listener?.({ payload: { kind: 'style', value: 'pixel' } })
      app.listener?.({ payload: { kind: 'side', value: 'bottom-edge' } })
      app.listener?.({ payload: { kind: 'execute', value: 'shell' } })
    })
    expect(app.style).toHaveBeenCalledExactlyOnceWith('pixel')
    expect(app.side).toHaveBeenCalledExactlyOnceWith('bottom-edge')
    app.enabled = false
    act(() => app.listener?.({ payload: { kind: 'hide' } }))
    expect(app.desktop).not.toHaveBeenCalled()
    unmount()
    expect(app.stop).toHaveBeenCalledTimes(1)
    act(() => app.listener?.({ payload: { kind: 'settings' } }))
    expect(app.navigate).not.toHaveBeenCalled()
  })
  it('opens settings in main and uses the existing hide preference', async () => {
    renderHook(usePetMenuActions)
    await act(async () => {
      app.listener?.({ payload: { kind: 'settings' } })
      app.listener?.({ payload: { kind: 'hide' } })
      await Promise.resolve()
    })
    expect(app.navigate).toHaveBeenCalledWith('settings')
    expect(app.show).toHaveBeenCalledTimes(1)
    expect(app.desktop).toHaveBeenCalledWith(false)
  })
})
