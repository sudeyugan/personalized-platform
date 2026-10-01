import { describe, expect, it } from 'vitest'
import { availableSlots, datesFor, shiftReflectionDate } from './moodReflectionDates'

describe('mood reflection dates', () => {
  it('includes the full leap month and Monday-based weeks across years', () => {
    expect(datesFor('2024-02-15', 'month')).toHaveLength(29)
    expect(datesFor('2024-02-15', 'month').at(-1)).toBe('2024-02-29')
    expect(datesFor('2026-01-01', 'week')).toEqual([
      '2025-12-29', '2025-12-30', '2025-12-31', '2026-01-01',
      '2026-01-02', '2026-01-03', '2026-01-04',
    ])
  })

  it('does not skip short months when moving from the last day', () => {
    expect(shiftReflectionDate('2024-01-31', 'month', 1)).toBe('2024-02-01')
    expect(shiftReflectionDate('2026-01-31', 'month', -1)).toBe('2025-12-01')
    expect(shiftReflectionDate('2026-01-01', 'week', -1)).toBe('2025-12-25')
  })

  it('counts only elapsed days and the current period, regardless of the anchor', () => {
    const now = new Date(2026, 9, 5, 13)
    expect(availableSlots(datesFor('2026-10-01', 'month'), now)).toBe(14)
    expect(availableSlots(datesFor('2026-09-01', 'month'), now)).toBe(90)
    expect(availableSlots(datesFor('2026-11-01', 'month'), now)).toBe(0)
    expect(availableSlots(datesFor('2026-10-01', 'week'), new Date(2026, 9, 1, 10))).toBe(10)
  })

  it('uses the existing morning, afternoon and evening boundaries', () => {
    const dates = ['2026-10-01']
    expect(availableSlots(dates, new Date(2026, 9, 1, 11, 59))).toBe(1)
    expect(availableSlots(dates, new Date(2026, 9, 1, 12))).toBe(2)
    expect(availableSlots(dates, new Date(2026, 9, 1, 18))).toBe(3)
  })
})
