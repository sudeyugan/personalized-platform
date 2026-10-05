import { describe, expect, it } from 'vitest'
import { chooseFortune, FORTUNE_COUNT, normalizeFortune } from './fortune'
import { createSeedLibrary, normalizeLibrary } from './seed'
import { fortuneSigns } from '../modules/fortune/signs'

describe('daily fortune compatibility', () => {
  it('keeps an existing sign during the same day and draws on the next day', () => {
    const previous = { date: '2026-10-04', signId: 17 }
    expect(chooseFortune(previous, previous.date, () => 0)).toBe(previous)
    expect(chooseFortune(previous, '2026-10-05', () => 0)).toEqual({ date: '2026-10-05', signId: 1 })
    expect(chooseFortune(undefined, '2026-10-05', () => .99999).signId).toBe(FORTUNE_COUNT)
  })
  it('rejects invalid dates and sign numbers', () => {
    for (const value of [null, {}, { date: '2026-02-30', signId: 1 }, { date: '2026-10-05', signId: 0 }, { date: '2026-10-05', signId: 49 }, { date: '2026-10-05', signId: '2' }]) expect(normalizeFortune(value)).toBeUndefined()
  })
  it('preserves the result and disabled module through backup normalization', () => {
    const data = createSeedLibrary()
    data.fortune = { today: { date: '2026-10-05', signId: 48 } }
    data.settings.modules.find((item) => item.id === 'fortune')!.enabled = false
    const restored = normalizeLibrary(JSON.parse(JSON.stringify(data)))
    expect(restored.fortune).toEqual(data.fortune)
    expect(restored.settings.modules.find((item) => item.id === 'fortune')?.enabled).toBe(false)
    expect(normalizeLibrary(restored).fortune).toEqual(restored.fortune)
  })
  it('contains a stable original sign for every accepted id', () => {
    expect(fortuneSigns).toHaveLength(FORTUNE_COUNT)
    expect(new Set(fortuneSigns.map((item) => item.title)).size).toBe(FORTUNE_COUNT)
    expect(fortuneSigns.map((item) => item.id)).toEqual(Array.from({ length: FORTUNE_COUNT }, (_, index) => index + 1))
    expect(fortuneSigns.every((item) => item.poem && item.meaning && item.advice)).toBe(true)
  })
})
