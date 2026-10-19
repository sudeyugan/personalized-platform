import type { Records } from '@yiyu/sync'
import type { Assignment } from '../../../desktop/src/domain/assignments/types'
import type { CalendarEvent, TodoItem } from '../../../desktop/src/domain/models'
import {
  assignmentOverview,
  assignmentDeadlineLabel,
} from '../../../desktop/src/modules/planner/assignments/assignmentPresentation'
import { isTodoCompletedOn } from '../../../desktop/src/modules/planner/plannerDates'
import { rows, today, todoVisible } from '../data'
import { TodoCheck } from '../TodoCheck'
import { ArrowUpRight, CalendarDays, Plus } from 'lucide-react'
import { useLocalClock } from '../useLocalClock'
export type Action = (job: () => Promise<unknown>) => Promise<void>
export function HomePage({
  records,
  go,
}: {
  records: Records
  go(page: string, key?: string): void
  action: Action
}) {
  const clock = useLocalClock()
  const date = today(),
    todos = rows<TodoItem>(records, 'todos').filter((todo) => todoVisible(todo, date))
  const assignments = assignmentOverview(rows<Assignment>(records, 'assignments'))
  const appointments = rows<CalendarEvent>(records, 'calendar')
    .filter((item) => item.date === date)
    .sort((a, b) => (a.time || '99').localeCompare(b.time || '99'))
  const now = clock.toTimeString().slice(0, 5)
  const next = appointments.find((item) => !item.time || item.time >= now)
  const pending = [...assignments.weekly, ...assignments.once]
  return (
    <section className="home-page mobile-today">
      <p className="eyebrow">
        {clock.toLocaleDateString('zh-CN', {
          month: 'long',
          day: 'numeric',
          weekday: 'long',
        })}
      </p>
      <h1>今天，从容一点。</h1>
      <button className="next-arrangement" onClick={() => go(next ? 'calendar' : 'courses')}>
        <span className="eyebrow">
          {next ? '接下来的安排　' + (next.time || '今天') : '把这一周，随身带着'}
        </span>
        <strong>{next?.title || '课表与日程'}</strong>
        <span className="muted">{next?.note || '查看完整课表与日历，不猜测尚未同步的教学周'}</span>
        <ArrowUpRight size={20} />
      </button>
      <header className="section-heading">
        <h2>{pending.length ? '还有 ' + pending.length + ' 份作业待交' : '本周的作业'}</h2>
        <button className="text-button" onClick={() => go('assignments')}>
          查看全部 <ArrowUpRight size={15} />
        </button>
      </header>
      <div className="today-assignment-list">
        {pending.slice(0, 4).map((item) => (
          <button
            className="today-assignment"
            key={item.assignment.id + '-' + item.key}
            onClick={() => go('assignments')}
          >
            <span className={'due-dot ' + (item.status === 'overdue' ? 'overdue' : '')} />
            <span className="grow">{item.assignment.subject || item.assignment.title}</span>
            <small>{assignmentDeadlineLabel(item)}</small>
          </button>
        ))}
        {!pending.length && <p className="muted">本周周作业与单次截止，都暂时没有待交。</p>}
      </div>
      <header className="section-heading">
        <h2>留给今天的事</h2>
        <button className="text-button" aria-label="管理待办" onClick={() => go('todos')}>
          <Plus size={19} />
        </button>
      </header>
      <div className="today-todos">
        {todos.slice(0, 6).map((todo) => (
          <article className="todo-row" key={todo.id}>
            <TodoCheck
              recordKey={'todos/' + todo.id}
              value={todo as unknown as Record<string, unknown>}
              disabled={false}
            />
            <button className="todo-title" onClick={() => go('todos')}>
              <span className={isTodoCompletedOn(todo, date) ? 'done' : ''}>{todo.title}</span>
              {todo.note && <small>{todo.note}</small>}
            </button>
          </article>
        ))}
        {!todos.length && (
          <p className="muted">
            今天还留着空白。
            <button className="text-button" onClick={() => go('todos')}>
              留下一件小事 ＋
            </button>
          </p>
        )}
      </div>
      <footer className="today-footer">
        <button className="text-button" onClick={() => go('calendar')}>
          <CalendarDays size={16} /> 日历
        </button>
        <button className="text-button" onClick={() => go('courses')}>
          完整课表 ↗
        </button>
      </footer>
      <div className="paper-landscape" aria-hidden="true">
        <i />
        <i />
      </div>
    </section>
  )
}
