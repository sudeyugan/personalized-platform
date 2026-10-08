import { describe, expect, it } from 'vitest'
import { createHeartPulseRate } from './companionHeartRate'

describe('approximate visual pulse tempo', () => {
  it('changes smoothly, caps rapid tempo and resets on missing data', () => {
    const rate = createHeartPulseRate()
    expect(rate(0, 60)).toBe(1)
    const changed = rate(1000, 120)
    expect(changed).toBeGreaterThan(1); expect(changed).toBeLessThan(1.8)
    for (let now = 2000; now <= 20_000; now += 1000) expect(rate(now, 240)).toBeLessThanOrEqual(1.8)
    expect(rate(21_000, null)).toBe(1)
  })
  it('has a slow-tempo floor, without modifying the actual reading', () => {
    const rate = createHeartPulseRate(); rate(0, 30)
    for (let now = 1000; now <= 20_000; now += 1000) expect(rate(now, 30)).toBeGreaterThanOrEqual(.67)
  })
})
