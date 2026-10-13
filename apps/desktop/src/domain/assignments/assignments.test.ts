import { describe, expect, it } from 'vitest'
import type { Assignment } from './types'
import { assignmentOccurrence, assignmentOccurrences, assignmentRuleChangeStart, shiftAssignmentDate, validAssignmentDate, validAssignmentTime } from './dates'
import { normalizeAssignments } from './normalization'

const now = new Date('2026-10-11T12:00:00')
const weekly = (): Assignment => ({ id: 'math', title: '数学练习', subject: '数学', note: '', createdAt: '', rules: [{ id: 'weekly', repeat: 'weekly', startDate: '2026-10-01', weekdays: [5], time: '18:00' }], periods: {} })
describe('assignment deadline periods', () => {
  it('validates actual dates, leap days, bounds and clock times', () => {
    expect(['2024-02-29', '2026-12-31'].every(validAssignmentDate)).toBe(true)
    expect(['2026-02-29', '2026-04-31', '2026-00-01', '2200-01-01', '2026-1-01'].some(validAssignmentDate)).toBe(false)
    expect(validAssignmentTime('23:59')).toBe(true); expect(validAssignmentTime('24:00')).toBe(false)
    expect(shiftAssignmentDate('2024-02-28', 2)).toBe('2024-03-01')
  })
  it('retains overdue weeks and generates future periods without saving them', () => {
    const assignment = weekly(), snapshot = JSON.stringify(assignment)
    expect(assignmentOccurrences([assignment], now, '2026-10-23').map(item => [item.date, item.status])).toEqual([['2026-10-02', 'overdue'], ['2026-10-09', 'overdue'], ['2026-10-16', 'upcoming'], ['2026-10-23', 'upcoming']])
    expect(JSON.stringify(assignment)).toBe(snapshot)
  })
  it('uses day end when no time is specified, and a precise time otherwise', () => {
    const assignment = weekly(); assignment.rules[0] = { id: 'once', repeat: 'once', startDate: '2026-10-11', weekdays: [] }
    expect(assignmentOccurrence(assignment, 'once@2026-10-11', new Date('2026-10-11T23:59:59'))?.status).toBe('today')
    expect(assignmentOccurrence(assignment, 'once@2026-10-11', new Date('2026-10-12T00:00:00'))?.status).toBe('overdue')
    assignment.rules[0].time = '12:00'
    expect(assignmentOccurrence(assignment, 'once@2026-10-11', new Date('2026-10-11T12:00:01'))?.status).toBe('overdue')
  })
  it('records early or late submissions against their original period only', () => {
    const assignment = weekly(); assignment.periods['weekly@2026-10-16'] = { submittedAt: now.toISOString() }; assignment.periods['weekly@2026-10-09'] = { submittedAt: now.toISOString() }
    const items = assignmentOccurrences([assignment], now)
    expect(items.find(item => item.originalDate === '2026-10-16')?.status).toBe('submitted')
    expect(items.find(item => item.originalDate === '2026-10-09')?.status).toBe('submitted')
    expect(items.find(item => item.originalDate === '2026-10-02')?.status).toBe('overdue')
  })
  it('moves one period across months without merging another occurrence', () => {
    const assignment = weekly(); assignment.periods['weekly@2026-10-09'] = { date: '2026-11-13', time: null }
    const items = assignmentOccurrences([assignment], now, '2026-11-13').filter(item => item.date === '2026-11-13')
    expect(items).toHaveLength(2); expect(items[0].key).not.toBe(items[1].key)
    expect(items.find(item => item.originalDate === '2026-10-09')?.time).toBeUndefined()
  })
  it('obeys weekday/start/end boundaries and keeps manually touched future periods', () => {
    const assignment = weekly(); assignment.rules[0].endDate = '2026-10-10'; assignment.periods['weekly@2026-10-16'] = { skipped: true }
    expect(assignmentOccurrences([assignment], now).map(item => item.originalDate)).toEqual(['2026-10-02', '2026-10-09', '2026-10-16'])
    expect(assignmentOccurrence(assignment, 'weekly@2026-10-16', now)?.status).toBe('skipped')
    expect(assignmentOccurrence(assignment, 'weekly@2026-10-15', now)).toBeUndefined()
    expect(assignmentOccurrence(assignment, 'weekly@2026-10-09@', now)).toBeUndefined()
  })
  it('protects touched future periods and scheduled future rules when changing a rule', () => {
    const assignment = weekly(); assignment.periods['weekly@2026-10-23'] = { submittedAt: now.toISOString() }
    expect(assignmentRuleChangeStart(assignment, '2026-10-11')).toBe('2026-10-24')
    assignment.rules.push({ ...assignment.rules[0], id: 'future', startDate: '2026-11-01' })
    expect(assignmentRuleChangeStart(assignment, '2026-10-11')).toBe('2026-11-02')
  })
  it('normalizes absent or invalid data, retaining valid exceptions and soft archives', () => {
    expect(normalizeAssignments(undefined)).toEqual([])
    const assignment = weekly(); assignment.deletedAt = now.toISOString(); assignment.periods = { 'weekly@2026-10-09': { date: '2026-10-11', time: null, skipped: true }, 'weekly@2026-10-09@': {}, 'weekly@2026-10-15': {}, 'weekly@2026-10-16': { date: '2026-02-29' } }
    const restored = normalizeAssignments(JSON.parse(JSON.stringify([assignment])))[0]
    expect(Object.keys(restored.periods)).toEqual(['weekly@2026-10-09']); expect(restored.deletedAt).toBe(assignment.deletedAt)
    expect(assignmentOccurrences([restored], now)).toEqual([])
  })
  it('shows a first weekly occurrence even for rules beginning after the preview horizon', () => {
    const assignment = weekly(); assignment.rules[0].startDate = '2027-01-01'
    expect(assignmentOccurrences([assignment], now)[0].date).toBe('2027-01-01')
  })
  it('bounds invalid navigation horizons to the default preview', () => {
    expect(assignmentOccurrences([weekly()], now, 'invalid')).toEqual(assignmentOccurrences([weekly()], now))
    expect(assignmentOccurrences([weekly()], now, '9999-12-31')).toEqual(assignmentOccurrences([weekly()], now))
  })
})
