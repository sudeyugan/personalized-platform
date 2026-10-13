import type { Assignment, AssignmentOccurrence } from '../../../domain/assignments/types'
import { assignmentOccurrences, shiftAssignmentDate, validAssignmentDate } from '../../../domain/assignments/dates'
import { formatLocalDate } from '../../../domain/localDate'

export function assignmentWeek(now = new Date()) {
  const from = shiftAssignmentDate(formatLocalDate(now), -((now.getDay() + 6) % 7))
  return { from, to: shiftAssignmentDate(from, 6) }
}
export function isWeeklyAssignment(item: AssignmentOccurrence) {
  return item.assignment.rules.find(rule => rule.id === item.key.split('@')[0])?.repeat === 'weekly'
}
export const assignmentPending = (item: AssignmentOccurrence) => item.status !== 'submitted' && item.status !== 'skipped'
export function assignmentDeadlineLabel(item: AssignmentOccurrence, now = new Date()) {
  const date = isWeeklyAssignment(item) && item.date.slice(0, 4) === String(now.getFullYear()) ? item.date.slice(5).replace('-', '/') : item.date.replaceAll('-', '/')
  const weekday = isWeeklyAssignment(item) ? new Date(`${item.date}T12:00:00`).toLocaleDateString('zh-CN', { weekday: 'short' }) + ' · ' : ''
  return `${weekday}${date}${item.time ? ' · ' + item.time : ''}`
}
export function assignmentOverview(assignments: Assignment[], now = new Date(), targetDate?: string) {
  const week = assignmentWeek(now)
  const through = validAssignmentDate(targetDate) && targetDate > week.to ? targetDate : week.to
  const occurrences = assignmentOccurrences(assignments, now, through)
  const inWeek = (item: AssignmentOccurrence) => item.date >= week.from && item.date <= week.to
  return {
    week, occurrences,
    weekly: occurrences.filter(item => isWeeklyAssignment(item) && inWeek(item) && assignmentPending(item)),
    once: occurrences.filter(item => !isWeeklyAssignment(item) && assignmentPending(item)),
    history: occurrences.filter(item => !assignmentPending(item) || (isWeeklyAssignment(item) && item.date < week.from)).sort((a, b) => b.deadline - a.deadline),
  }
}
