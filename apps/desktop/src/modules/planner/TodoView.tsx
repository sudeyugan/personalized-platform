import { CalendarClock, Check, Circle, ListTodo, Plus, Repeat2, Trash2 } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import type { CourseDay, TodoItem } from '../../domain/models'
import { formatLocalDate } from '../../domain/localDate'
import { useLibraryStore } from '../../state/useLibraryStore'
import { dayNumber, isTodoCompletedOn, recurringTodoOccursOn, todoCompletionStats } from './plannerDates'
import { scheduleShortDays } from './scheduleConstants'

type Filter = 'today' | 'all' | 'done'
type RepeatMode = 'none' | 'daily' | 'weekly'
const priorityLabel = { low: '低', medium: '普通', high: '重要' } as const
const repeatLabel: Record<RepeatMode, string> = { none: '不重复', daily: '每日', weekly: '每周指定日期' }

function WeekdayPicker({ value, onChange }: { value: CourseDay[]; onChange: (days: CourseDay[]) => void }) {
  const toggle = (day: CourseDay) => onChange(value.includes(day) ? value.filter((item) => item !== day) : [...value, day].sort())
  return <div className="weekday-picker" aria-label="每周重复日期">{scheduleShortDays.map((label, index) => { const day = (index + 1) as CourseDay; return <button type="button" className={value.includes(day) ? 'active' : ''} key={day} onClick={() => toggle(day)}>周{label}</button> })}</div>
}

export function TodoView() {
  const { data, addTodo, updateTodo, toggleTodoForDate, deleteTodo } = useLibraryStore()
  const today = formatLocalDate()
  const [title, setTitle] = useState('')
  const [repeat, setRepeat] = useState<RepeatMode>('none')
  const [dueDate, setDueDate] = useState(today)
  const [repeatDays, setRepeatDays] = useState<CourseDay[]>([dayNumber(today)])
  const [filter, setFilter] = useState<Filter>('today')
  const completedToday = (todo: TodoItem) => isTodoCompletedOn(todo, today)
  const relevantToday = (todo: TodoItem) => recurringTodoOccursOn(todo, today)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    addTodo({ title, repeat, dueDate: repeat === 'none' ? dueDate : undefined, repeatDays: repeat === 'weekly' ? (repeatDays.length ? repeatDays : [dayNumber(today)]) : undefined })
    setTitle('')
  }
  const todos = useMemo(() => data.planner.todos.filter((item) => filter === 'all' || (filter === 'done' ? relevantToday(item) && completedToday(item) : relevantToday(item) && !completedToday(item))).sort((a, b) => Number(completedToday(a)) - Number(completedToday(b)) || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')), [data.planner.todos, filter, today])
  const openCount = data.planner.todos.filter((item) => relevantToday(item) && !completedToday(item)).length
  const changeRepeat = (todo: TodoItem, next: RepeatMode) => updateTodo(todo.id, { repeat: next, dueDate: next === 'none' ? todo.dueDate ?? today : undefined, repeatDays: next === 'weekly' ? (todo.repeatDays?.length ? todo.repeatDays : [dayNumber(today)]) : undefined, completed: false, completedDates: [] })

  return <main className="todo-view scroll-view"><header className="page-header"><div><p className="eyebrow">轻轻理清下一步</p><h1>待办清单</h1><p>{openCount ? `今天还有 ${openCount} 件事情，重复任务会在设定日期重新出现。` : '今天的事项已经完成。'}</p></div></header><form className="todo-compose" onSubmit={submit}><div className="todo-compose-main"><ListTodo size={18} /><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="添加一件要做的事…" /><label><Repeat2 size={13} /><select aria-label="新待办重复方式" value={repeat} onChange={(event) => setRepeat(event.target.value as RepeatMode)}>{Object.entries(repeatLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><button className="primary-button" type="submit" disabled={!title.trim()}><Plus size={15} />添加</button></div>{repeat === 'none' && <label className="todo-compose-date"><CalendarClock size={14} />执行日期<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>}{repeat === 'weekly' && <WeekdayPicker value={repeatDays} onChange={setRepeatDays} />}</form><div className="todo-filters">{(['today', 'all', 'done'] as const).map((item) => <button className={filter === item ? 'active' : ''} key={item} onClick={() => setFilter(item)}>{item === 'today' ? '今天' : item === 'all' ? '全部' : '今日已完成'}</button>)}</div><section className="todo-list">{todos.map((todo) => { const completed = completedToday(todo); const mode = todo.repeat === 'daily' ? 'daily' : todo.repeat === 'weekly' || todo.repeat === 'weekdays' ? 'weekly' : 'none'; const stats = todoCompletionStats(todo, today); return <article className={completed ? 'todo-card completed' : `todo-card priority-${todo.priority}`} key={todo.id}><button className="todo-check" aria-label={completed ? '恢复为未完成' : '标记今天完成'} onClick={() => toggleTodoForDate(todo.id, today)}>{completed ? <Check size={17} /> : <Circle size={17} />}</button><div className="todo-fields"><input defaultValue={todo.title} onBlur={(event) => updateTodo(todo.id, { title: event.target.value.trim() || todo.title })} /><textarea defaultValue={todo.note} onBlur={(event) => updateTodo(todo.id, { note: event.target.value })} placeholder="添加备注" rows={1} />{stats && <div className="todo-stats" title={`从创建日至今，应完成 ${stats.expected} 次`}><span>累计完成 {stats.completed} 次</span><span>{stats.completed} / {stats.expected}</span><strong>{stats.percentage}%</strong><i><b style={{ width: `${stats.percentage}%` }} /></i></div>}</div><div className="todo-rule">{mode === 'none' && <label className="todo-date"><CalendarClock size={14} /><input aria-label="执行日期" type="date" value={todo.dueDate ?? today} onChange={(event) => updateTodo(todo.id, { dueDate: event.target.value || undefined })} /></label>}{mode === 'weekly' && <WeekdayPicker value={todo.repeatDays ?? [dayNumber(todo.dueDate ?? today)]} onChange={(days) => updateTodo(todo.id, { repeatDays: days.length ? days : [dayNumber(today)], completedDates: [] })} />}{mode === 'daily' && <span className="daily-label"><Repeat2 size={13} />每天</span>}</div><div className="todo-options"><select aria-label="优先级" value={todo.priority} onChange={(event) => updateTodo(todo.id, { priority: event.target.value as typeof todo.priority })}>{Object.entries(priorityLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><select aria-label="重复方式" value={mode} onChange={(event) => changeRepeat(todo, event.target.value as RepeatMode)}>{Object.entries(repeatLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div><button className="todo-delete" aria-label="删除待办" onClick={() => deleteTodo(todo.id)}><Trash2 size={15} /></button></article> })}{todos.length === 0 && <div className="todo-empty"><Check size={32} /><p>{filter === 'done' ? '今天还没有已完成的事项。' : '这一栏已经清空了。'}</p></div>}</section></main>
}
