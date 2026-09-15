import { CalendarClock, Check, Circle, ListTodo, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { useLibraryStore } from '../../state/useLibraryStore'

type Filter = 'open' | 'all' | 'done'
const priorityLabel = { low: '低', medium: '普通', high: '重要' } as const

export function TodoView() {
  const { data, addTodo, updateTodo, deleteTodo } = useLibraryStore()
  const [title, setTitle] = useState('')
  const [filter, setFilter] = useState<Filter>('open')
  const submit = (event: FormEvent) => { event.preventDefault(); addTodo(title); setTitle('') }
  const todos = useMemo(() => data.planner.todos.filter((item) => filter === 'all' || (filter === 'done' ? item.completed : !item.completed)).sort((a, b) => Number(a.completed) - Number(b.completed) || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')), [data.planner.todos, filter])
  const openCount = data.planner.todos.filter((item) => !item.completed).length

  return <main className="todo-view scroll-view"><header className="page-header"><div><p className="eyebrow">轻轻理清下一步</p><h1>待办清单</h1><p>{openCount ? `还有 ${openCount} 件事情，按自己的节奏完成。` : '现在没有未完成的事项。'}</p></div></header>
    <form className="todo-compose" onSubmit={submit}><ListTodo size={18} /><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="添加一件要做的事…" /><button className="primary-button" type="submit" disabled={!title.trim()}><Plus size={15} />添加</button></form>
    <div className="todo-filters">{(['open', 'all', 'done'] as const).map((item) => <button className={filter === item ? 'active' : ''} key={item} onClick={() => setFilter(item)}>{item === 'open' ? '未完成' : item === 'all' ? '全部' : '已完成'}</button>)}</div>
    <section className="todo-list">{todos.map((todo) => <article className={todo.completed ? 'todo-card completed' : `todo-card priority-${todo.priority}`} key={todo.id}><button className="todo-check" aria-label={todo.completed ? '恢复为未完成' : '标记完成'} onClick={() => updateTodo(todo.id, { completed: !todo.completed })}>{todo.completed ? <Check size={17} /> : <Circle size={17} />}</button><div className="todo-fields"><input defaultValue={todo.title} onBlur={(event) => updateTodo(todo.id, { title: event.target.value.trim() || todo.title })} /><textarea defaultValue={todo.note} onBlur={(event) => updateTodo(todo.id, { note: event.target.value })} placeholder="添加备注" rows={1} /></div><label className="todo-date"><CalendarClock size={14} /><input type="date" value={todo.dueDate ?? ''} onChange={(event) => updateTodo(todo.id, { dueDate: event.target.value || undefined })} /></label><select aria-label="优先级" value={todo.priority} onChange={(event) => updateTodo(todo.id, { priority: event.target.value as typeof todo.priority })}>{Object.entries(priorityLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><button className="todo-delete" aria-label="删除待办" onClick={() => deleteTodo(todo.id)}><Trash2 size={15} /></button></article>)}{todos.length === 0 && <div className="todo-empty"><Check size={32} /><p>{filter === 'done' ? '还没有已完成的事项。' : '这一栏已经清空了。'}</p></div>}</section>
  </main>
}
