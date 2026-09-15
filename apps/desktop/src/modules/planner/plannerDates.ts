import type { Course, PlannerData, TodoItem } from '../../domain/models'
import { formatLocalDate } from '../../domain/localDate'

export const dateFromKey = (key: string) => new Date(`${key}T12:00:00`)
export const dayNumber = (key: string) => (dateFromKey(key).getDay() || 7) as 1 | 2 | 3 | 4 | 5 | 6 | 7
export const isTodoCompletedOn = (todo: TodoItem, date: string) => !todo.repeat || todo.repeat === 'none' ? todo.completed : (todo.completedDates ?? []).includes(date)

export function recurringTodoOccursOn(todo: TodoItem, date: string) {
  if (!todo.repeat || todo.repeat === 'none') return todo.dueDate === date
  const day = dayNumber(date)
  if (todo.repeat === 'daily') return true
  if (todo.repeat === 'weekdays') return day <= 5
  const reference = todo.dueDate || formatLocalDate(new Date(todo.createdAt))
  return (todo.repeatDays ?? [dayNumber(reference)]).includes(day)
}

export function termWeek(date: string, term: PlannerData['term']) {
  const days = Math.floor((dateFromKey(date).getTime() - dateFromKey(term.startDate).getTime()) / 86_400_000)
  const week = Math.floor(days / 7) + 1
  return week >= 1 && week <= term.totalWeeks ? week : undefined
}

function courseIncludesWeek(course: Course, week: number) {
  const value = course.weeks.trim()
  if (!value || value.includes('全周')) return true
  if (value.includes('单周') && week % 2 === 0) return false
  if (value.includes('双周') && week % 2 === 1) return false
  const ranges = [...value.matchAll(/(\d+)\s*[-~至]\s*(\d+)/g)]
  if (ranges.some((match) => week >= Number(match[1]) && week <= Number(match[2]))) return true
  const withoutRanges = value.replace(/\d+\s*[-~至]\s*\d+/g, '')
  const singles = [...withoutRanges.matchAll(/\d+/g)].map((match) => Number(match[0]))
  return singles.includes(week)
}

export function courseOccursOn(course: Course, date: string, term: PlannerData['term']) {
  const week = termWeek(date, term)
  return course.day === dayNumber(date) && week !== undefined && courseIncludesWeek(course, week)
}

export function calendarDates(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12)
  const mondayOffset = (first.getDay() + 6) % 7
  const start = new Date(first); start.setDate(first.getDate() - mondayOffset)
  return Array.from({ length: 42 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date })
}
