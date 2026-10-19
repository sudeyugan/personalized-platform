import type { Records } from '@yiyu/sync'
import type { TodoItem } from '../../desktop/src/domain/models'
import {
  isTodoCompletedOn,
  quotaTodoProgress,
  recurringTodoOccursOn,
} from '../../desktop/src/modules/planner/plannerDates'
export { formatLocalDate as today } from '../../desktop/src/domain/localDate'
export const text = (value: unknown) => (typeof value === 'string' ? value : '')
export function rows<T>(records: Records, collection: string): T[] {
  return Object.entries(records)
    .filter(([key, item]) => key.startsWith(`${collection}/`) && !item.deletedAt)
    .map(([, item]) => item as T)
}
export function toggleTodo(todo: TodoItem, date: string, now = new Date()): TodoItem {
  if (todo.repeat === 'quota') {
    const progress = quotaTodoProgress(todo, date)
    return {
      ...todo,
      quotaCompletions: progress.reached
        ? (todo.quotaCompletions ?? []).filter((item) => item.id !== progress.completions.at(-1)?.id)
        : [...(todo.quotaCompletions ?? []), { id: crypto.randomUUID(), completedAt: now.toISOString() }],
    }
  }
  if (todo.repeat && todo.repeat !== 'none') {
    const done = isTodoCompletedOn(todo, date)
    return {
      ...todo,
      completedDates: done
        ? (todo.completedDates ?? []).filter((day) => day !== date)
        : [...new Set([...(todo.completedDates ?? []), date])],
    }
  }
  return { ...todo, completed: !todo.completed }
}
export function todoVisible(todo: TodoItem, date: string) {
  return !todo.repeat || todo.repeat === 'none' || recurringTodoOccursOn(todo, date)
}
export function searchable(records: Records, query: string) {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return []
  return Object.entries(records)
    .filter(
      ([, value]) =>
        !value.deletedAt &&
        [
          'title',
          'name',
          'note',
          'content',
          'plainText',
          'description',
          'summary',
          'draft',
          'question',
          'background',
        ].some(
          (field) =>
            typeof value[field] === 'string' && String(value[field]).toLocaleLowerCase().includes(needle),
        ),
    )
    .slice(0, 80)
}
