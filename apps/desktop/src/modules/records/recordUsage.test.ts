import { describe, expect, it } from 'vitest'
import { matchesUsage, usageChanges } from './recordUsage'
import { createSeedLibrary, normalizeLibrary } from '../../domain/seed'

describe('record usage', () => {
  it('keeps old records unclassified instead of guessing', () => {
    expect(matchesUsage({}, { usage: 'unclassified', workId: '' })).toBe(true)
    expect(matchesUsage({}, { usage: 'fiction', workId: '' })).toBe(false)
    expect(usageChanges({ usage: '', workId: '' })).toEqual({ usage: undefined, workId: undefined })
  })
  it('filters explicit work ownership independently from chapter references', () => {
    expect(matchesUsage({ usage: 'real', workId: 'w1' }, { usage: 'real', workId: 'w1' })).toBe(true)
    expect(matchesUsage({ usage: 'real', workId: 'w1' }, { usage: 'all', workId: 'w2' })).toBe(false)
  })
  it('preserves ownership and original identities through normalization', () => {
    const data = createSeedLibrary()
    data.people[0] = { ...data.people[0], usage: 'fiction', workId: 'work-a' }
    const normalized = normalizeLibrary(data)
    expect(normalized.people[0]).toEqual(data.people[0])
    expect(normalized.entityLinks).toEqual(data.entityLinks)
  })
})
