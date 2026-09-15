import { CalendarClock, Check, Circle, ListTodo, Plus, Repeat2, Trash2 } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import type { TodoItem } from '../../domain/models'
import { formatLocalDate } from '../../domain/localDate'
import { useLibraryStore } from '../../state/useLibraryStore'
import { isTodoCompletedOn, recurringTodoOccursOn } from './plannerDates'

type Filter = 'today' | 'all' | 'done'
const priorityLabel = { low: '低', medium: '普通', high: '重要' } as const
const repeatLabel = { none: '不重复', daily: '每天', weekdays: '工作日', weekly: '每周' } as const

export function TodoView() {
  const { data, addTodo, updateTodo, toggleTodoForDate, deleteTodo } = useLibraryStore()
  const [title, setTitle] = useState('')
  const [repeat, setRepeat] = useState<NonNullable<TodoItem['repeat']>>('none')
  const [filter, setFilter] = useState<Filter>('today')
  const today = formatLocalDate()
  const completedToday = (todo: TodoItem) => isTodoCompletedOn(todo, today)
  const relevantToday = (todo: TodoItem) => !todo.repeat || todo.repeat === 'none' ? !todo.completed : recurringTodoOccursOn(todo, today)
  const submit = (event: FormEvent) => { event.preventDefault(); addTodo(title, repeat); setTitle('') }
  const todos = useMemo(() => data.planner.todos.filter((item) => filter === 'all' || (filter === 'done' ? relevantToday(item) && completedToday(item) : relevantToday(item) && !completedToday(item))).sort((a, b) => Number(completedToday(a)) - Number(completedToday(b)) || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')), [data.planner.todos, filter, today])
  const openCount = data.planner.todos.filter((item) => relevantToday(item) && !completedToday(item)).length

  return <main className="todo-view scroll-view"><header className="page-header"><div><p className="eyebrow">轻轻理清下一步</p><h1>待办清单</h1><p>{openCount ? `今天还有 ${openCount} 件事情，重复任务明天会重新出现。` : '今天的事项已经完成。'}</p></div></header><form className="todo-compose" onSubmit={submit}><ListTodo size={18} /><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="添加一件要做的事…" /><label><Repeat2 size={13} /><select aria-label="新待办重复方式" value={repeat} onChange={(event) => setRepeat(event.target.value as typeof repeat)}>{Object.entries(repeatLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><button className="primary-button" type="submit" disabled={!title.trim()}><Plus size={15} />添加</button></form><div className="todo-filters">{(['today', 'all', 'done'] as const).map((item) => <button className={filter === item ? 'active' : ''} key={item} onClick={() => setFilter(item)}>{item === 'today' ? '今天' : item === 'all' ? '全部' : '今日已完成'}</button>)}</div><section className="todo-list">{todos.map((todo) => { const completed = completedToday(todo); return <article className={completed ? 'todo-card completed' : `todo-card priority-${todo.priority}`} key={todo.id}><button className="todo-check" aria-label={completed ? '恢复为未完成' : '标记今天完成'} onClick={() => toggleTodoForDate(todo.id, today)}>{completed ? <Check size={17} /> : <Circle size={17} />}</button><div className="todo-fields"><input defaultValue={todo.title} onBlur={(event) => updateTodo(todo.id, { title: event.target.value.trim() || todo.title })} /><textarea defaultValue={todo.note} onBlur={(event) => updateTodo(todo.id, { note: event.target.value })} placeholder="添加备注" rows={1} /></div><label className="todo-date"><CalendarClock size={14} /><input type="date" value={todo.dueDate ?? ''} onChange={(event) => updateTodo(todo.id, { dueDate: event.target.value || undefined })} /></label><div className="todo-options"><select aria-label="优先级" value={todo.priority} onChange={(event) => updateTodo(todo.id, { priority: event.target.value as typeof todo.priority })}>{Object.entries(priorityLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><select aria-label="重复方式" value={todo.repeat ?? 'none'} onChange={(event) => updateTodo(todo.id, { repeat: event.target.value as NonNullable<TodoItem['repeat']>, completed: false, completedDates: [] })}>{Object.entries(repeatLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div><button className="todo-delete" aria-label="删除待办" onClick={() => deleteTodo(todo.id)}><Trash2 size={15} /></button></article> })}{todos.length === 0 && <div className="todo-empty"><Check size={32} /><p>{filter === 'done' ? '今天还没有已完成的事项。' : '这一栏已经清空了。'}</p></div>}</section></main>
}
