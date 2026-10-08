import { describe, expect, it } from 'vitest'
import { chooseFortune, FORTUNE_COUNT, FORTUNE_COUNTS, normalizeFortune, normalizeFortunes } from './fortune'
import { createSeedLibrary, normalizeLibrary } from './seed'
import { fortuneSigns } from '../modules/fortune/signs'
import { loveSigns } from '../modules/fortune/loveSigns'
import { futureSigns } from '../modules/fortune/futureSigns'

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
  it('normalizes categories independently and preserves legacy id 48', () => {
    const today = { date: '2026-10-05', signId: 48 }
    const love = { date: '2026-10-05', signId: 24 }
    expect(normalizeFortunes({ today, love, future: { ...love, signId: 25 } })).toEqual({ today, love })
    expect(normalizeFortunes({ today, love: { date: '2026-02-30', signId: 2 }, future: love })).toEqual({ today, future: love })
    expect(normalizeFortunes([today])).toEqual({})
    expect(normalizeFortunes(undefined)).toEqual({})
    expect(normalizeFortunes({ extra: today })).toEqual({})
  })
  it('bounds new draws by each bank and handles non-finite random samples', () => {
    for (const kind of ['daily', 'love', 'future'] as const) {
      const previous = { date: '2026-10-05', signId: FORTUNE_COUNTS[kind] }
      expect(chooseFortune(previous, previous.date, () => 0, kind)).toBe(previous)
      for (const sample of [NaN, Infinity, -1]) expect(chooseFortune(undefined, previous.date, () => sample, kind).signId).toBe(1)
      expect(chooseFortune(undefined, previous.date, () => 1, kind).signId).toBe(FORTUNE_COUNTS[kind])
    }
  })
  it('round-trips all three local results through backup normalization', () => {
    const data = createSeedLibrary()
    data.fortune = { today: { date: '2026-10-04', signId: 48 }, love: { date: '2026-10-05', signId: 24 }, future: { date: '2026-10-05', signId: 19 } }
    data.settings.modules.find((item) => item.id === 'fortune')!.enabled = false
    const restored = normalizeLibrary(JSON.parse(JSON.stringify(data)))
    expect(restored.fortune).toEqual(data.fortune)
    expect(normalizeLibrary(restored).fortune).toEqual(data.fortune)
    expect(restored.settings.modules.find((item) => item.id === 'fortune')?.enabled).toBe(false)
  })
  it('provides separate stable original theme banks and all three interpretations', () => {
    const titles = new Set(fortuneSigns.map((sign) => sign.title))
    for (const [bank, labels] of [[loveSigns, ['相遇', '心意', '行动']], [futureSigns, ['进展', '阻碍', '时机']]] as const) {
      expect(bank).toHaveLength(24)
      expect(bank.map((sign) => sign.id)).toEqual(Array.from({ length: 24 }, (_, index) => index + 1))
      for (const sign of bank) {
        expect(titles.has(sign.title)).toBe(false); titles.add(sign.title)
        expect(sign.poem && sign.meaning && sign.advice).toBeTruthy()
        expect(sign.entries.map((entry) => entry.label)).toEqual(labels)
        expect(sign.entries.every((entry) => entry.text.length > 0)).toBe(true)
      }
    }
    expect(titles.size).toBe(96)
  })
})
