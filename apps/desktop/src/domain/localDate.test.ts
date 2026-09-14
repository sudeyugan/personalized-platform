import { describe, expect, it } from 'vitest'
import { formatLocalDate } from './localDate'

describe('formatLocalDate', () => {
  it('uses stable local calendar components', () => {
    expect(formatLocalDate(new Date(2026, 7, 9, 23, 59))).toBe('2026-08-09')
  })
})
