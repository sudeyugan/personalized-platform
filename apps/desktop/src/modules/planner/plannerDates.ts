import type { Course, PlannerData, TodoItem } from '../../domain/models'
import { formatLocalDate } from '../../domain/localDate'

export const dateFromKey = (key: string) => new Date(`${key}T12:00:00`)
export const dayNumber = (key: string) => (dateFromKey(key).getDay() || 7) as 1 | 2 | 3 | 4 | 5 | 6 | 7
export const isTodoHoliday = (holidayDates: string[], date: string) => holidayDates.includes(date)
export const isTodoCompletedOn = (todo: TodoItem, date: string) => {
  if (!todo.repeat || todo.repeat === 'none') return todo.completed
  if (todo.repeat === 'quota') return quotaTodoProgress(todo, date).reached
  return (todo.completedDates ?? []).includes(date)
}

export function recurringTodoOccursOn(todo: TodoItem, date: string, holidayDates: string[] = []) {
  if (isTodoHoliday(holidayDates, date)) return false
  if (!todo.repeat || todo.repeat === 'none') return todo.dueDate === date
  if (todo.repeat === 'quota') return date >= formatLocalDate(new Date(todo.createdAt))
  const day = dayNumber(date)
  if (todo.repeat === 'daily') return true
  if (todo.repeat === 'weekdays') return day <= 5
  const reference = todo.dueDate || formatLocalDate(new Date(todo.createdAt))
  return (todo.repeatDays ?? [dayNumber(reference)]).includes(day)
}

export function todoCompletionStats(todo: TodoItem, throughDate = formatLocalDate(), holidayDates: string[] = []) {
  if (!todo.repeat || todo.repeat === 'none' || todo.repeat === 'quota') return undefined
  const startKey = formatLocalDate(new Date(todo.createdAt))
  const start = dateFromKey(startKey)
  const end = dateFromKey(throughDate)
  if (start > end) return { completed: 0, expected: 0, percentage: 0 }
  let expected = 0
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    if (recurringTodoOccursOn(todo, formatLocalDate(cursor), holidayDates)) expected += 1
  }
  const completed = new Set(todo.completedDates ?? []).size
    ? [...new Set(todo.completedDates ?? [])].filter((date) => date >= startKey && date <= throughDate && recurringTodoOccursOn(todo, date, holidayDates)).length
    : 0
  return { completed, expected, percentage: expected ? Math.round((completed / expected) * 100) : 0 }
}

function quotaPeriodKey(date: string, period: NonNullable<TodoItem['quotaPeriod']>) {
  if (period === 'day') return date
  if (period === 'month') return date.slice(0, 7)
  const value = dateFromKey(date)
  value.setDate(value.getDate() - (value.getDay() + 6) % 7)
  return formatLocalDate(value)
}

export function quotaTodoProgress(todo: TodoItem, date = formatLocalDate()) {
  const period = todo.quotaPeriod ?? 'week'
  const target = Math.min(99, Math.max(1, todo.quotaTarget ?? 3))
  const key = quotaPeriodKey(date, period)
  const completions = (todo.quotaCompletions ?? []).filter((entry) => quotaPeriodKey(formatLocalDate(new Date(entry.completedAt)), period) === key)
  const count = completions.length
  return {
    count,
    target,
    reached: count >= target,
    overage: Math.max(0, count - target),
    percentage: Math.min(100, Math.round((count / target) * 100)),
    total: (todo.quotaCompletions ?? []).length,
    completions,
    periodLabel: period === 'day' ? '今日' : period === 'month' ? '本月' : '本周',
  }
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
