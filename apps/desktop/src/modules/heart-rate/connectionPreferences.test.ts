import { afterEach, describe, expect, it, vi } from 'vitest'
import { HEART_CONNECTION_KEY, emptyConnectionPreferences, normalizeConnectionPreferences, readConnectionPreferences, saveConnectionPreferences, nextHeartRetry } from './connectionPreferences'

const device = { id: `hr-${'a'.repeat(64)}`, name: 'Forerunner 265' }
afterEach(() => { localStorage.clear(); vi.restoreAllMocks() })
describe('local heart connection preferences', () => {
  it('stores only the scoped identifier, name and opt-in, not readings', () => {
    const preferences = normalizeConnectionPreferences({ version: 1, device: { ...device, address: 12345 }, autoConnect: true, bpm: 72 })
    expect(saveConnectionPreferences(preferences)).toBe(true)
    expect(readConnectionPreferences()).toEqual({ version: 1, device, autoConnect: true })
    expect(localStorage.getItem(HEART_CONNECTION_KEY)).not.toMatch(/bpm|address|ageMs/)
    expect(saveConnectionPreferences(emptyConnectionPreferences)).toBe(true)
    expect(localStorage.getItem(HEART_CONNECTION_KEY)).toBeNull()
  })
  it('defaults off for corrupt, unknown-version, old-session ids or incomplete preferences', () => {
    for (const value of [[], null, {}, { version: 2, device, autoConnect: true }, { version: 1, device: { ...device, id: 'hr-1-0' } }, { version: 1, device: { ...device, name: '' } }]) expect(normalizeConnectionPreferences(value)).toEqual(emptyConnectionPreferences)
    localStorage.setItem(HEART_CONNECTION_KEY, 'not JSON')
    expect(readConnectionPreferences()).toEqual(emptyConnectionPreferences)
    expect(normalizeConnectionPreferences({ version: 1, device, autoConnect: 'true' }).autoConnect).toBe(false)
  })
  it('degrades safely when local storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full') })
    expect(readConnectionPreferences()).toEqual(emptyConnectionPreferences)
    expect(saveConnectionPreferences({ version: 1, device, autoConnect: true })).toBe(false)
  })
  it('has two bounded retries after the first attempt', () => {
    expect(nextHeartRetry(1, 100)).toBe(15100)
    expect(nextHeartRetry(2, 100)).toBe(45100)
    expect(nextHeartRetry(3, 100)).toBeNull()
  })
})
