import { useState } from 'react'
import type { Records } from '@yiyu/sync'
import type { Assignment } from '../../../desktop/src/domain/assignments/types'
import type { CalendarEvent, Course, TodoItem } from '../../../desktop/src/domain/models'
import {
  assignmentOverview,
  assignmentDeadlineLabel,
} from '../../../desktop/src/modules/planner/assignments/assignmentPresentation'
import { isTodoCompletedOn } from '../../../desktop/src/modules/planner/plannerDates'
import { rows, text, today, todoVisible } from '../data'
import { TodoCheck } from '../TodoCheck'
import { ArrowUpRight, CalendarDays, Feather, Plus } from 'lucide-react'
import { RecordForm } from '../components/RecordForm'
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
  const [editing, setEditing] = useState<'diary' | 'todos'>()
  const date = today(),
    todos = rows<TodoItem>(records, 'todos').filter((todo) => todoVisible(todo, date))
  const assignments = assignmentOverview(rows<Assignment>(records, 'assignments'))
  const appointments = rows<CalendarEvent>(records, 'calendar')
    .filter((item) => item.date === date)
    .sort((a, b) => (a.time || '99').localeCompare(b.time || '99'))
  const now = clock.toTimeString().slice(0, 5)
  const next = appointments.find((item) => !item.time || item.time >= now)
  const pending = [...assignments.weekly, ...assignments.once]
  const courses = rows<Course>(records, 'courses').filter(course => course.day === (clock.getDay() || 7)).sort((a, b) => a.period - b.period)
  const diary = records['diary/' + date]?.deletedAt ? undefined : records['diary/' + date]
  const unfinished = todos.filter(todo => !isTodoCompletedOn(todo, date))
  return (
    <section className="home-page mobile-today">
      <header className="canvas-opening"><div><p className="eyebrow">一隅 · 日常画布</p><h1>今天，从容一点。</h1><p className="canvas-date">
        {clock.toLocaleDateString('zh-CN', {
          month: 'long',
          day: 'numeric',
          weekday: 'long',
        })}
      </p></div><span className="canvas-day" aria-hidden="true">{String(clock.getDate()).padStart(2, '0')}<small>{String(clock.getMonth() + 1).padStart(2, '0')} / {clock.getFullYear()}</small></span></header>
      <div className="canvas-flow"><section className="canvas-plans">
      <button className="next-arrangement" onClick={() => go(next ? 'calendar' : 'courses')}>
        <span className="eyebrow">
          {next ? '接下来的安排　' + (next.time || '今天') : '把这一周，随身带着'}
        </span>
        <strong>{next?.title || '课表与日程'}</strong>
        <span className="muted">{next?.note || '查看完整课表与日历，不猜测尚未同步的教学周'}</span>
        <ArrowUpRight size={20} />
      </button>
      {!!courses.length && <div className="canvas-courses" aria-label="今天的课程"><header><span>今日课节</span><button className="text-button" onClick={() => go('courses')}>整周 ↗</button></header><div>{courses.map(course => <button key={course.id} onClick={() => go('courses', 'courses/' + course.id)}><small>0{course.period}</small><strong>{course.title}</strong><span>{course.location || '教室待定'}</span></button>)}</div><p className="footnote">按星期呈现；教学周请在课表内核对。</p></div>}
      {!!pending.length && <><header className="section-heading">
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
      </>}
      <header className="section-heading">
        <h2>留给今天的事</h2>
        <button className="text-button" aria-label="管理待办" onClick={() => setEditing('todos')}>
          <Plus size={19} />
        </button>
      </header>
      <div className="today-todos">
        {unfinished.slice(0, 6).map((todo) => (
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
        {!unfinished.length && (
          <p className="muted">
            {todos.length ? '今天留下的事，已经完成。' : '今天还留着空白。'}
            <button className="text-button" onClick={() => setEditing('todos')}>
              留下一件小事 ＋
            </button>
          </p>
        )}
      </div>
      </section><section className="canvas-keepsake" aria-label="今日留白"><header><p className="eyebrow">留下一笔</p><button className="text-button" onClick={() => setEditing('diary')}><Feather size={15}/>{diary ? '接着写' : '写日记'}</button></header><h2>{text(diary?.title) || '日常的微光，值得留下。'}</h2><p>{text(diary?.content) || '几句话也好。不必完整，不必解释，留下今天想记住的。'}</p><footer><button className="text-button" onClick={() => go('diary')}>翻开日记册 <ArrowUpRight size={15}/></button><button className="text-button" onClick={() => go('moods')}>记下此刻心情</button></footer></section></div>
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
      {editing && <RecordForm collection={editing} records={records} recordKey={editing === 'diary' && diary ? 'diary/' + date : undefined} initialDate={date} close={() => setEditing(undefined)}/>}
    </section>
  )
}
