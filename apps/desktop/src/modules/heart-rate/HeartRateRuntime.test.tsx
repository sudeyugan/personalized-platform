import { StrictMode } from 'react'
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { HeartRateRuntime } from './HeartRateRuntime'
import { emptyHeartRate, useHeartRateStore } from './heartRate'
import { emptyConnectionPreferences } from './connectionPreferences'
const ipc = vi.hoisted(() => ({ invoke: vi.fn(), emitTo: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: ipc.invoke }))
vi.mock('@tauri-apps/api/event', () => ({ emitTo: ipc.emitTo }))
beforeEach(() => {
  vi.useFakeTimers(); localStorage.clear()
  Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} })
  useHeartRateStore.setState({ enabled: false, status: emptyHeartRate, revision: 0, preferences: { ...emptyConnectionPreferences }, initialized: false, reconnectTarget: null, pendingDevice: null, retryAt: null, retryAttempt: 0 })
  ipc.invoke.mockReset().mockImplementation(async (command) => command === 'heart_rate_scan' ? { ...emptyHeartRate, phase: 'scanning' } : emptyHeartRate)
  ipc.emitTo.mockReset().mockResolvedValue(undefined)
})
afterEach(() => { vi.useRealTimers(); delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ })
it('starts one opted-in scan in StrictMode and cancels it on unmount', async () => {
  useHeartRateStore.setState({ preferences: { version: 1, device: { id: `hr-${'a'.repeat(64)}`, name: '265' }, autoConnect: true } })
  const { unmount } = render(<StrictMode><HeartRateRuntime /></StrictMode>)
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  expect(ipc.invoke.mock.calls.filter(([command]) => command === 'heart_rate_scan')).toHaveLength(1)
  expect(ipc.emitTo.mock.calls.every(([, , payload]) => !JSON.stringify(payload).match(/device|265|hr-/))).toBe(true)
  unmount()
  await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
  expect(ipc.invoke.mock.calls.filter(([command]) => command === 'heart_rate_scan')).toHaveLength(1)
  expect(useHeartRateStore.getState().enabled).toBe(false)
})
it('does not start Bluetooth or leave a deferred startup when disabled', async () => {
  const { unmount } = render(<StrictMode><HeartRateRuntime /></StrictMode>)
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  unmount()
  expect(ipc.invoke).not.toHaveBeenCalled()
})
