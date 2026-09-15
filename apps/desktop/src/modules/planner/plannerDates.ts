import type { TodoItem } from '../../domain/models'
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
  return day === dayNumber(reference)
}

export function calendarDates(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12)
  const mondayOffset = (first.getDay() + 6) % 7
  const start = new Date(first); start.setDate(first.getDate() - mondayOffset)
  return Array.from({ length: 42 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date })
}
