import { formatLocalDate } from '../localDate'
import type { Assignment, AssignmentOccurrence, AssignmentRule } from './types'

export function validAssignmentDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^(20|21)\d{2}-(0[1-9]|1[0-2])-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T12:00:00`)
  return !Number.isNaN(parsed.getTime()) && formatLocalDate(parsed) === value
}
export const validAssignmentTime = (value: unknown): value is string => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
export function shiftAssignmentDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`)
  value.setDate(value.getDate() + days)
  return formatLocalDate(value)
}
export function assignmentScheduled(rule: AssignmentRule, date: string, ignoreEnd = false) {
  if (!validAssignmentDate(date) || date < rule.startDate || (!ignoreEnd && rule.endDate && date > rule.endDate)) return false
  return rule.repeat === 'once' ? date === rule.startDate : rule.weekdays.includes((new Date(`${date}T12:00:00`).getDay() || 7) as 1 | 2 | 3 | 4 | 5 | 6 | 7)
}
export function assignmentOccurrence(assignment: Assignment, key: string, now = new Date()): AssignmentOccurrence | undefined {
  if (key.split('@').length !== 2) return undefined
  const [ruleId, originalDate] = key.split('@')
  const rule = assignment.rules.find(item => item.id === ruleId)
  if (assignment.deletedAt || !rule || !assignmentScheduled(rule, originalDate, Boolean(assignment.periods[key]))) return undefined
  const period = assignment.periods[key]
  const date = period?.date ?? originalDate
  const time = period?.time === null ? undefined : period?.time ?? rule.time
  const deadline = new Date(`${date}T${time ? `${time}:00` : '23:59:59.999'}`).getTime()
  const skipped = Boolean(period?.skipped)
  const submittedAt = period?.submittedAt
  const status = submittedAt ? 'submitted' : skipped ? 'skipped' : deadline < now.getTime() ? 'overdue' : date === formatLocalDate(now) ? 'today' : 'upcoming'
  return { assignment, key, originalDate, date, time, deadline, skipped, submittedAt, status }
}

// Derived periods do not get saved. Only a submission or explicit exception does.
export function assignmentOccurrences(assignments: Assignment[], now = new Date(), through = shiftAssignmentDate(formatLocalDate(now), 21)): AssignmentOccurrence[] {
  if (!validAssignmentDate(through)) through = shiftAssignmentDate(formatLocalDate(now), 21)
  const result: AssignmentOccurrence[] = []
  for (const assignment of assignments) {
    if (assignment.deletedAt) continue
    const keys = new Set(Object.keys(assignment.periods))
    for (const rule of assignment.rules) {
      if (rule.repeat === 'once') { keys.add(`${rule.id}@${rule.startDate}`); continue }
      const until = rule.endDate && rule.endDate < through ? rule.endDate : through > rule.startDate ? through : shiftAssignmentDate(rule.startDate, 7)
      for (const weekday of rule.weekdays) {
        const startDay = new Date(`${rule.startDate}T12:00:00`).getDay() || 7
        for (let date = shiftAssignmentDate(rule.startDate, (weekday - startDay + 7) % 7); date <= until; date = shiftAssignmentDate(date, 7)) {
          keys.add(`${rule.id}@${date}`)
        }
      }
    }
    for (const key of keys) {
      const occurrence = assignmentOccurrence(assignment, key, now)
      if (occurrence) result.push(occurrence)
    }
  }
  return result.sort((a, b) => a.deadline - b.deadline || a.assignment.title.localeCompare(b.assignment.title))
}
export function assignmentRuleChangeStart(assignment: Assignment, today = formatLocalDate()) {
  const recordedFuture = Object.keys(assignment.periods).map(key => key.split('@')[1]).filter(date => date >= today).sort().at(-1)
  return [today, recordedFuture ? shiftAssignmentDate(recordedFuture, 1) : today, ...assignment.rules.map(rule => shiftAssignmentDate(rule.startDate, 1))].sort().at(-1)!
}
export function deadlineLabel(occurrence: AssignmentOccurrence) {
  return `${occurrence.date.replaceAll('-', '/')} · ${occurrence.time ?? '当天结束'}`
}
export function remainingLabel(occurrence: AssignmentOccurrence, now = new Date()) {
  if (occurrence.status === 'submitted') return '已交'
  if (occurrence.status === 'skipped') return '本期停交'
  const minutes = Math.ceil(Math.abs(occurrence.deadline - now.getTime()) / 60_000)
  const distance = minutes < 60 ? `${Math.max(1, minutes)} 分钟` : minutes < 1440 ? `${Math.ceil(minutes / 60)} 小时` : `${Math.ceil(minutes / 1440)} 天`
  return occurrence.status === 'overdue' ? `逾期 ${distance}` : `剩余 ${distance}`
}
