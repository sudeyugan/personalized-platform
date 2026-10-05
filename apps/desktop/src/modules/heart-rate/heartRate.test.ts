import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyHeartRate, useHeartRateStore } from './heartRate'
import { visibleHeartRate } from './display'
const ipc = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: ipc.invoke }))
describe('local heart rate lifecycle', () => {
  beforeEach(() => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} })
    useHeartRateStore.setState({ enabled: false, status: emptyHeartRate, revision: 0 })
    ipc.invoke.mockReset()
  })
  afterEach(() => { delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ })
  it('does not call native Bluetooth while disabled', async () => {
    await useHeartRateStore.getState().refresh()
    expect(ipc.invoke).not.toHaveBeenCalled()
  })
  it('never displays disconnected, stale, disabled or invalid readings', () => {
    const reading = { enabled: true, phase: 'connected' as const, bpm: 72, ageMs: 100 }
    expect(visibleHeartRate(reading)).toBe(72)
    expect(visibleHeartRate(reading, 10001)).toBeNull()
    expect(visibleHeartRate({ ...reading, enabled: false })).toBeNull()
    expect(visibleHeartRate({ ...reading, phase: 'error' })).toBeNull()
    expect(visibleHeartRate({ ...reading, ageMs: null })).toBeNull()
    expect(visibleHeartRate({ ...reading, bpm: 0 })).toBeNull()
  })
  it('ignores a late status response after disconnect', async () => {
    useHeartRateStore.setState({ enabled: true })
    let resolveStatus: ((status: typeof emptyHeartRate) => void) | undefined
    ipc.invoke.mockImplementation((command: string) => command === 'heart_rate_status' ? new Promise((resolve) => { resolveStatus = resolve }) : Promise.resolve(emptyHeartRate))
    const pending = useHeartRateStore.getState().refresh()
    await useHeartRateStore.getState().disconnect()
    resolveStatus?.({ ...emptyHeartRate, phase: 'connected', bpm: 88, ageMs: 0 })
    await pending
    expect(useHeartRateStore.getState().enabled).toBe(false)
    expect(useHeartRateStore.getState().status.bpm).toBeNull()
  })
})
