import { formatLocalDate } from '../../domain/localDate'

export type ReflectionRange = 'week' | 'month'

export function datesFor(referenceDate: string, range: ReflectionRange) {
  const reference = new Date(`${referenceDate}T12:00:00`)
  const start = range === 'month'
    ? new Date(reference.getFullYear(), reference.getMonth(), 1, 12)
    : new Date(reference)
  if (range === 'week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  const end = range === 'month'
    ? new Date(reference.getFullYear(), reference.getMonth() + 1, 0, 12)
    : new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 12)
  const dates: string[] = []
  const cursor = new Date(start)
  while (cursor <= end) {
    dates.push(formatLocalDate(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

export function shiftReflectionDate(date: string, range: ReflectionRange, direction: -1 | 1) {
  const reference = new Date(`${date}T12:00:00`)
  if (range === 'month') {
    reference.setDate(1)
    reference.setMonth(reference.getMonth() + direction)
  } else {
    reference.setDate(reference.getDate() + direction * 7)
  }
  return formatLocalDate(reference)
}

export function availableSlots(dates: string[], now = new Date()) {
  const today = formatLocalDate(now)
  const hour = now.getHours()
  const currentPeriod = hour < 12 ? 1 : hour < 18 ? 2 : 3
  return dates.reduce((count, date) => count + (date < today ? 3 : date === today ? currentPeriod : 0), 0)
}
