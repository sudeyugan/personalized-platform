import { describe, expect, it } from 'vitest'
import type { Assignment } from '../../../domain/assignments/types'
import { assignmentDeadlineLabel, assignmentOverview, assignmentWeek } from './assignmentPresentation'

const now = new Date('2026-10-14T12:00:00')
const weekly = (): Assignment => ({ id: 'physics', title: '物理', subject: '物理', note: '', createdAt: '', rules: [{ id: 'rule', repeat: 'weekly', startDate: '2026-10-01', weekdays: [5] }], periods: {} })
describe('minimal assignment overview', () => {
  it('uses the Monday–Sunday week across month and year boundaries', () => {
    expect(assignmentWeek(new Date('2027-01-01T12:00:00'))).toEqual({ from: '2026-12-28', to: '2027-01-03' })
    expect(assignmentWeek(new Date('2026-10-18T23:59:59'))).toEqual({ from: '2026-10-12', to: '2026-10-18' })
    expect(assignmentWeek(new Date('2026-10-19T00:00:00'))).toEqual({ from: '2026-10-19', to: '2026-10-25' })
  })
  it('shows only the unsubmitted weekly occurrence in this week, retaining earlier ones in history', () => {
    const assignment = weekly(), snapshot = JSON.stringify(assignment), view = assignmentOverview([assignment], now)
    expect(view.weekly.map(item => item.originalDate)).toEqual(['2026-10-16'])
    expect(view.history.map(item => item.originalDate)).toEqual(['2026-10-09', '2026-10-02'])
    expect(JSON.stringify(assignment)).toBe(snapshot)
  })
  it('hides submitted and skipped occurrences from the main list without altering history', () => {
    const assignment = weekly(); assignment.periods['rule@2026-10-16'] = { submittedAt: now.toISOString() }
    expect(assignmentOverview([assignment], now).weekly).toEqual([])
    assignment.periods['rule@2026-10-16'] = { skipped: true }
    expect(assignmentOverview([assignment], now).weekly).toEqual([])
    expect(assignmentOverview([assignment], now).history[0].status).toBe('skipped')
  })
  it('keeps far-future and overdue single deadlines, not only this week', () => {
    const past = weekly(), future = weekly()
    past.rules[0] = { id: 'past', repeat: 'once', startDate: '2026-10-01', weekdays: [] }
    future.id = 'future'; future.rules[0] = { id: 'future', repeat: 'once', startDate: '2027-02-01', weekdays: [] }
    expect(assignmentOverview([past, future], now).once.map(item => item.date)).toEqual(['2026-10-01', '2027-02-01'])
  })
  it('uses an overridden actual deadline to determine which week to display', () => {
    const assignment = weekly(); assignment.periods['rule@2026-10-09'] = { date: '2026-10-15' }; assignment.periods['rule@2026-10-16'] = { date: '2026-10-20' }
    const view = assignmentOverview([assignment], now)
    expect(view.weekly.map(item => item.originalDate)).toEqual(['2026-10-09'])
    expect(assignmentOverview([assignment], now, '2026-10-23').occurrences.some(item => item.originalDate === '2026-10-23')).toBe(true)
  })
  it('does not preview a future weekly rule on the main list and keeps absolute years when needed', () => {
    const assignment = weekly(); assignment.rules[0].startDate = '2027-01-01'
    const view = assignmentOverview([assignment], now)
    expect(view.weekly).toEqual([])
    expect(assignmentDeadlineLabel(view.occurrences[0], now)).toContain('2027/01/01')
  })
})
