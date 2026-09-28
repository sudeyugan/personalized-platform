import { BookOpenText, CalendarDays, Check, Circle, ListTodo } from 'lucide-react'
import { formatLocalDate } from '../../domain/localDate'
import { useLibraryStore } from '../../state/useLibraryStore'
import { courseOccursOn, isTodoCompletedOn, quotaTodoProgress, recurringTodoOccursOn } from '../planner/plannerDates'

export function TodayDesk() {
  const { data, navigate, selectChapter, toggleTodoForDate, recordTodoCompletion, removeTodoCompletion } = useLibraryStore()
  const today = formatLocalDate()
  const events = data.planner.calendarEvents.filter((event) => event.date === today).sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
  const courses = data.planner.courses.filter((course) => courseOccursOn(course, today, data.planner.term)).sort((a, b) => a.period - b.period)
  const todos = data.planner.todos.filter((todo) => recurringTodoOccursOn(todo, today, data.planner.holidayDates))
  const latestChapter = Object.values(data.chapters).filter((chapter) => !chapter.deletedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]

  const toggleTodo = (todoId: string) => {
    const todo = data.planner.todos.find((item) => item.id === todoId)
    if (!todo) return
    if (todo.repeat === 'quota') {
      const progress = quotaTodoProgress(todo, today)
      const latest = progress.completions.at(-1)
      if (progress.reached && latest) removeTodoCompletion(todo.id, latest.id)
      else recordTodoCompletion(todo.id)
    } else toggleTodoForDate(todo.id, today)
  }

  return <section className={'today-desk'}>
    <header><div><p className={'eyebrow'}>今日工作台</p><h2>今天只看眼前要做的事</h2></div><small>{events.length + courses.length} 项安排 · {todos.filter((todo) => !isTodoCompletedOn(todo, today)).length} 项待办</small></header>
    <div className={'today-desk-grid'}>
      <article><button className={'today-desk-title'} onClick={() => navigate('calendar')}><CalendarDays size={16} /><span>安排</span></button>
        {[...events.map((event) => ({ id: event.id, meta: event.time || '全天', title: event.title })), ...courses.map((course) => ({ id: course.id, meta: '第 ' + course.period + ' 节', title: course.title }))].slice(0, 4).map((item) => <div className={'today-desk-line'} key={item.id}><small>{item.meta}</small><strong>{item.title}</strong></div>)}
        {!events.length && !courses.length && <p>今天没有固定安排，留一点自由时间。</p>}
      </article>
      <article><button className={'today-desk-title'} onClick={() => navigate('todos')}><ListTodo size={16} /><span>待办</span></button>
        {todos.slice(0, 4).map((todo) => { const done = isTodoCompletedOn(todo, today); return <button className={done ? 'today-todo done' : 'today-todo'} key={todo.id} onClick={() => toggleTodo(todo.id)}>{done ? <Check size={13} /> : <Circle size={13} />}<span>{todo.title}</span></button> })}
        {!todos.length && <p>今天没有待办。</p>}
      </article>
      <article><button className={'today-desk-title'} onClick={() => navigate('writing')}><BookOpenText size={16} /><span>继续创作</span></button>
        {latestChapter ? <button className={'today-writing'} onClick={() => selectChapter(latestChapter.id)}><strong>{latestChapter.title}</strong><span>{latestChapter.summary || latestChapter.plainText.slice(0, 70) || '这一章还在等第一句话。'}</span><small>{latestChapter.wordCount} 字 · {new Date(latestChapter.updatedAt).toLocaleDateString('zh-CN')}</small></button> : <p>还没有可以继续的章节。</p>}
      </article>
    </div>
  </section>
}
