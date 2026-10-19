import { useState } from 'react'
import type { Records } from '@yiyu/sync'
import type {
  Assignment,
  AssignmentOccurrence,
} from '../../../desktop/src/domain/assignments/types'
import type { CalendarEvent, Course, TodoItem } from '../../../desktop/src/domain/models'
import {
  assignmentDeadlineLabel,
  assignmentOverview,
} from '../../../desktop/src/modules/planner/assignments/assignmentPresentation'
import { calendarDates } from '../../../desktop/src/modules/planner/plannerDates'
import { rows, today, todoVisible } from '../data'
import { modify, update } from '../repository'
import { TodoCheck } from '../TodoCheck'
import { RecordForm } from '../components/RecordForm'
import type { Action } from './HomePage'
export function PlannerPage({
  records,
  initial,
  action,
  target,
}: {
  records: Records
  initial: string
  action: Action
  target?: string
}) {
  const [tab, setTab] = useState(initial === 'planner' ? 'todos' : initial)
  const [editing, setEditing] = useState<{ collection: string; key?: string } | undefined>(() =>
    target &&
    records[target] &&
    ['todos', 'assignments', 'calendar', 'courses'].includes(target.split('/')[0])
      ? { collection: target.split('/')[0], key: target }
      : undefined,
  )
  const [date, setDate] = useState(today()),
    [month, setMonth] = useState(() => new Date())
  const todos = rows<TodoItem>(records, 'todos').filter((todo) => todoVisible(todo, today()))
  const assignments = rows<Assignment>(records, 'assignments'),
    overview = assignmentOverview(assignments)
  const appointments = rows<CalendarEvent>(records, 'calendar')
  const courses = rows<Course>(records, 'courses').sort(
    (a, b) => a.day - b.day || a.period - b.period,
  )
  const remove = (key: string) => {
    if (confirm('移除这份记录？删除会同步到其他设备。')) void action(() => update(key, null))
  }
  const submission = (item: AssignmentOccurrence) =>
    action(() =>
      modify(`assignments/${item.assignment.id}`, (current) => {
        const periods = { ...(current.periods as Assignment['periods']) },
          period = { ...periods[item.key] }
        if (period.submittedAt) delete period.submittedAt
        else period.submittedAt = new Date().toISOString()
        periods[item.key] = period
        return { ...current, periods }
      }),
    )
  const assignmentCard = (item: AssignmentOccurrence) => (
    <article className="assignment-card paper-card" key={`${item.assignment.id}-${item.key}`}>
      <div className="deadline-stamp">
        <span>{item.date.slice(5, 7)}月</span>
        <strong>{item.date.slice(8)}</strong>
      </div>
      <div>
        <small>
          {item.status === 'overdue' ? '已过截止 · ' : ''}
          {assignmentDeadlineLabel(item)}
        </small>
        <h3>{item.assignment.subject || item.assignment.title}</h3>
        {item.assignment.note && <p>{item.assignment.note}</p>}
        <button onClick={() => void submission(item)}>
          {item.submittedAt ? '撤回已交标记' : '标记已交'}
        </button>
      </div>
    </article>
  )
  return (
    <section>
      <p className="eyebrow">让要紧的事，各归其位</p>
      <h1>日常，有条不紊。</h1>
      <div className="segments" role="group" aria-label="日常页面">
        {[
          ['todos', '待办'],
          ['assignments', '作业'],
          ['calendar', '日历'],
          ['courses', '课表'],
        ].map(([id, label]) => (
          <button aria-pressed={tab === id} key={id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <header className="section-heading">
        <h2>
          {tab === 'todos'
            ? '留给今天'
            : tab === 'assignments'
              ? '本周与单次截止'
              : tab === 'calendar'
                ? '日历安排'
                : '这一周的课'}
        </h2>
        <button className="primary" onClick={() => setEditing({ collection: tab })}>
          ＋ {tab === 'assignments' ? '记作业' : '留一笔'}
        </button>
      </header>
      {tab === 'todos' && (
        <div className="paper-card">
          {!todos.length && <p className="empty">先留下一件想做的小事。</p>}
          {todos.map((todo) => (
            <article className="todo-row" key={todo.id}>
              <TodoCheck
                recordKey={`todos/${todo.id}`}
                value={todo as unknown as Record<string, unknown>}
                disabled={false}
              />
              <div className="grow">
                <h3>{todo.title}</h3>
                <small>
                  {todo.repeat && todo.repeat !== 'none' ? '周期待办 · ' : ''}
                  {todo.dueDate ?? ''}
                </small>
                {todo.note && <p>{todo.note}</p>}
              </div>
              <button
                aria-label={`编辑${todo.title}`}
                className="text-button"
                onClick={() => setEditing({ collection: 'todos', key: `todos/${todo.id}` })}
              >
                编辑
              </button>
              <button className="text-button" onClick={() => remove(`todos/${todo.id}`)}>
                移除
              </button>
            </article>
          ))}
        </div>
      )}
      {tab === 'assignments' && (
        <>
          <h3>这周还没交</h3>
          {overview.weekly.length ? (
            overview.weekly.map(assignmentCard)
          ) : (
            <p className="empty small-empty">本周没有待交的周作业。</p>
          )}
          <h3>单次截止</h3>
          {overview.once.map(assignmentCard)}
          <details>
            <summary>已交与往期记录</summary>
            {overview.history.map(assignmentCard)}
          </details>
          <details>
            <summary>课程作业设置</summary>
            {assignments.map((item) => (
              <div className="record" key={item.id}>
                <h3>{item.subject || item.title}</h3>
                <div className="toolbar">
                  <button
                    onClick={() =>
                      setEditing({
                        collection: 'assignments',
                        key: `assignments/${item.id}`,
                      })
                    }
                  >
                    编辑
                  </button>
                  <button onClick={() => remove(`assignments/${item.id}`)}>移除</button>
                </div>
              </div>
            ))}
          </details>
        </>
      )}
      {tab === 'calendar' && (
        <>
          <div className="month-heading">
            <button
              aria-label="上个月"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            >
              ←
            </button>
            <h3>
              {month.getFullYear()} 年 {month.getMonth() + 1} 月
            </h3>
            <button
              aria-label="下个月"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            >
              →
            </button>
          </div>
          <div className="month-grid">
            {'一二三四五六日'.split('').map((day) => (
              <small key={day}>{day}</small>
            ))}
            {calendarDates(month).map((day) => {
              const key = day.toLocaleDateString('sv-SE')
              return (
                <button
                  className={day.getMonth() !== month.getMonth() ? 'outside-month' : ''}
                  aria-pressed={date === key}
                  aria-label={key}
                  key={key}
                  onClick={() => setDate(key)}
                >
                  {day.getDate()}
                  {appointments.some((item) => item.date === key) && <i />}
                </button>
              )
            })}
          </div>
          <h3>{date}</h3>
          {appointments
            .filter((item) => item.date === date)
            .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
            .map((item) => (
              <article className="paper-card" key={item.id}>
                <small>{item.time || '全天'}</small>
                <h3>{item.title}</h3>
                <p>{item.note}</p>
                <div className="toolbar">
                  <button
                    onClick={() =>
                      setEditing({
                        collection: 'calendar',
                        key: `calendar/${item.id}`,
                      })
                    }
                  >
                    编辑
                  </button>
                  <button onClick={() => remove(`calendar/${item.id}`)}>移除</button>
                </div>
              </article>
            ))}
        </>
      )}
      {tab === 'courses' && (
        <>
          <p className="footnote">
            周次按每门课程原样保留；这里按星期阅读完整课表，不将未配置的学期日期猜成当前周。
          </p>
          {Array.from({ length: 7 }, (_, i) => i + 1).map((day) => (
            <section className="course-day" key={day}>
              <h3>周{'一二三四五六日'[day - 1]}</h3>
              {courses
                .filter((course) => course.day === day)
                .map((course) => (
                  <button
                    className="course-card"
                    key={course.id}
                    onClick={() =>
                      setEditing({
                        collection: 'courses',
                        key: `courses/${course.id}`,
                      })
                    }
                  >
                    <strong>{course.title}</strong>
                    <span>
                      第 {course.period} 节 · {course.location || '教室待定'}
                    </span>
                    <small>
                      {course.teacher} · {course.weeks}
                    </small>
                  </button>
                ))}
              {!courses.some((course) => course.day === day) && <p className="muted">留白</p>}
            </section>
          ))}
        </>
      )}
      {editing && (
        <RecordForm
          key={editing.key ?? `new-${editing.collection}`}
          collection={editing.collection}
          recordKey={editing.key}
          records={records}
          initialDate={date}
          close={() => setEditing(undefined)}
        />
      )}
    </section>
  )
}
