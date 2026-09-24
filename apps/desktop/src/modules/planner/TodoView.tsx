import { CalendarClock, CalendarOff, Check, Circle, ListTodo, Plus, Repeat2, Settings2, Target } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { CourseDay, TodoItem } from '../../domain/models'
import { formatLocalDate } from '../../domain/localDate'
import { useLibraryStore } from '../../state/useLibraryStore'
import { dayNumber, isTodoCompletedOn, isTodoHoliday, quotaTodoProgress, recurringTodoOccursOn, todoCompletionStats } from './plannerDates'
import { TodoQuotaProgress } from './TodoQuotaControls'
import { TodoSettingsDialog } from './TodoSettingsDialog'
import { TodoWeekdayPicker } from './TodoWeekdayPicker'

type Filter = 'today' | 'all' | 'done'
type RepeatMode = 'none' | 'daily' | 'weekly' | 'quota'
const repeatLabel: Record<RepeatMode, string> = { none: '不重复', daily: '每日', weekly: '每周指定日期', quota: '周期次数' }

export function TodoView() {
  const { data, addTodo, updateTodo, toggleTodoForDate, toggleTodoHoliday, recordTodoCompletion, removeTodoCompletion, deleteTodo } = useLibraryStore()
  const today = formatLocalDate()
  const [title, setTitle] = useState('')
  const [repeat, setRepeat] = useState<RepeatMode>('none')
  const [dueDate, setDueDate] = useState(today)
  const [repeatDays, setRepeatDays] = useState<CourseDay[]>([dayNumber(today)])
  const [filter, setFilter] = useState<Filter>('today')
  const [settingsTodoId, setSettingsTodoId] = useState<string>()
  useEffect(() => {
    const navigation = data.session.agentNavigation
    if (navigation?.destination !== 'todos') return
    if (navigation.filter === 'today' || navigation.filter === 'all' || navigation.filter === 'done') setFilter(navigation.filter)
    if (navigation.targetId && data.planner.todos.some((todo) => todo.id === navigation.targetId)) setSettingsTodoId(navigation.targetId)
  }, [data.session.agentNavigation?.id, data.planner.todos])
  const holidayDates = data.planner.holidayDates ?? []
  const todayIsHoliday = isTodoHoliday(holidayDates, today)
  const completedToday = (todo: TodoItem) => isTodoCompletedOn(todo, today)
  const relevantToday = (todo: TodoItem) => recurringTodoOccursOn(todo, today, holidayDates)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    addTodo({ title, repeat, dueDate: repeat === 'none' ? dueDate : undefined, repeatDays: repeat === 'weekly' ? (repeatDays.length ? repeatDays : [dayNumber(today)]) : undefined, quotaPeriod: repeat === 'quota' ? 'week' : undefined, quotaTarget: repeat === 'quota' ? 3 : undefined })
    setTitle('')
  }
  const todos = useMemo(() => data.planner.todos.filter((item) => filter === 'all' || (filter === 'done' ? relevantToday(item) && completedToday(item) : relevantToday(item) && (!completedToday(item) || item.repeat === 'quota'))).sort((a, b) => Number(completedToday(a)) - Number(completedToday(b)) || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')), [data.planner.todos, data.planner.holidayDates, filter, today])
  const openCount = data.planner.todos.filter((item) => relevantToday(item) && !completedToday(item)).length
  const settingsTodo = data.planner.todos.find((todo) => todo.id === settingsTodoId)
  const changeRepeat = (todo: TodoItem, next: RepeatMode) => updateTodo(todo.id, { repeat: next, dueDate: next === 'none' ? todo.dueDate ?? today : undefined, repeatDays: next === 'weekly' ? (todo.repeatDays?.length ? todo.repeatDays : [dayNumber(today)]) : undefined, quotaPeriod: next === 'quota' ? todo.quotaPeriod ?? 'week' : undefined, quotaTarget: next === 'quota' ? todo.quotaTarget ?? 3 : undefined, quotaCompletions: next === 'quota' ? todo.quotaCompletions ?? [] : [], completed: false, completedDates: [] })

  return (
    <main className="todo-view scroll-view">
      <header className="page-header todo-page-header">
        <div><p className="eyebrow">轻轻理清下一步</p><h1>待办清单</h1><p>{todayIsHoliday ? '今天休假，所有待办均不需要记录。' : openCount ? `今天还有 ${openCount} 件事情，重复任务会在设定日期重新出现。` : '今天的事项已经完成。'}</p></div>
        <button className={todayIsHoliday ? 'todo-holiday-toggle active' : 'todo-holiday-toggle'} type="button" onClick={() => toggleTodoHoliday(today)}><CalendarOff size={15} />{todayIsHoliday ? '取消今日休假' : '今天休假'}</button>
      </header>

      <form className="todo-compose" onSubmit={submit}>
        <div className="todo-compose-main">
          <ListTodo size={18} />
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="添加一件要做的事…" />
          <label><Repeat2 size={13} /><select aria-label="新待办重复方式" value={repeat} onChange={(event) => setRepeat(event.target.value as RepeatMode)}>{Object.entries(repeatLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <button className="primary-button" type="submit" disabled={!title.trim()}><Plus size={15} />添加</button>
        </div>
        {repeat === 'none' && <label className="todo-compose-date"><CalendarClock size={14} />执行日期<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>}
        {repeat === 'weekly' && <TodoWeekdayPicker value={repeatDays} onChange={setRepeatDays} />}
        {repeat === 'quota' && <p className="todo-compose-hint">默认每周完成 3 次，添加后可在设置中调整。</p>}
      </form>

      <div className="todo-filters">
        {(['today', 'all', 'done'] as const).map((item) => <button className={filter === item ? 'active' : ''} key={item} onClick={() => setFilter(item)}>{item === 'today' ? '今天' : item === 'all' ? '全部' : '今日已完成'}</button>)}
      </div>

      <section className="todo-list">
        {todos.map((todo) => {
          const completed = completedToday(todo)
          const mode: RepeatMode = todo.repeat === 'daily' ? 'daily' : todo.repeat === 'weekly' || todo.repeat === 'weekdays' ? 'weekly' : todo.repeat === 'quota' ? 'quota' : 'none'
          const stats = todoCompletionStats(todo, today, holidayDates)
          const quota = mode === 'quota' ? quotaTodoProgress(todo, today) : undefined
          const cardClass = mode === 'quota'
            ? `todo-card priority-${todo.priority}${quota?.reached ? ' quota-achieved' : ''}`
            : completed ? 'todo-card completed' : `todo-card priority-${todo.priority}`

          return (
            <article className={cardClass} key={todo.id}>
              {mode === 'quota'
                ? <span className="todo-check quota-icon" title="周期次数任务"><Target size={17} /></span>
                : <button className="todo-check" disabled={todayIsHoliday} aria-label={completed ? '恢复为未完成' : '标记今天完成'} onClick={() => toggleTodoForDate(todo.id, today)}>{completed ? <Check size={17} /> : <Circle size={17} />}</button>}
              <div className="todo-fields">
                <input defaultValue={todo.title} onBlur={(event) => updateTodo(todo.id, { title: event.target.value.trim() || todo.title })} />
                <textarea defaultValue={todo.note} onBlur={(event) => updateTodo(todo.id, { note: event.target.value })} placeholder="添加备注" rows={1} />
                {stats && <div className="todo-stats" title={`从创建日至今，应完成 ${stats.expected} 次`}><span>累计完成 {stats.completed} 次</span><span>{stats.completed} / {stats.expected}</span><strong>{stats.percentage}%</strong><i><b style={{ width: `${stats.percentage}%` }} /></i></div>}
                {mode === 'quota' && <TodoQuotaProgress todo={todo} date={today} disabled={todayIsHoliday} onAdd={() => recordTodoCompletion(todo.id)} />}
              </div>
              <button className="todo-settings-trigger" type="button" aria-label={`设置“${todo.title}”`} onClick={() => setSettingsTodoId(todo.id)}><Settings2 size={16} /></button>
            </article>
          )
        })}
        {todos.length === 0 && <div className="todo-empty">{todayIsHoliday && filter !== 'all' ? <CalendarOff size={32} /> : <Check size={32} />}<p>{todayIsHoliday && filter !== 'all' ? '今天休假，不需要记录任何待办。' : filter === 'done' ? '今天还没有已完成的事项。' : '这一栏已经清空了。'}</p></div>}
      </section>
      {settingsTodo && <TodoSettingsDialog
        todo={settingsTodo}
        today={today}
        onClose={() => setSettingsTodoId(undefined)}
        onUpdate={(changes) => updateTodo(settingsTodo.id, changes)}
        onChangeRepeat={(next) => changeRepeat(settingsTodo, next)}
        onRemoveCompletion={(completionId) => removeTodoCompletion(settingsTodo.id, completionId)}
        onDelete={() => { deleteTodo(settingsTodo.id); setSettingsTodoId(undefined) }}
      />}
    </main>
  )
}
