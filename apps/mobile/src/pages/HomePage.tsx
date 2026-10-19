import type { Records } from '@yiyu/sync'
import type { Assignment } from '../../../desktop/src/domain/assignments/types'
import type { CalendarEvent, Chapter, TodoItem } from '../../../desktop/src/domain/models'
import { assignmentOverview } from '../../../desktop/src/modules/planner/assignments/assignmentPresentation'
import { isTodoCompletedOn } from '../../../desktop/src/modules/planner/plannerDates'
import { rows, today, todoVisible } from '../data'
import { TodoCheck } from '../TodoCheck'
import { ArrowUpRight, Feather, Smile, Sparkles } from 'lucide-react'
export type Action = (job: () => Promise<unknown>) => Promise<void>
export function HomePage({
  records,
  go,
}: {
  records: Records
  go(page: string, key?: string): void
  action: Action
}) {
  const date = today(),
    todos = rows<TodoItem>(records, 'todos').filter((todo) => todoVisible(todo, date))
  const assignments = assignmentOverview(rows<Assignment>(records, 'assignments'))
  const appointments = rows<CalendarEvent>(records, 'calendar').filter((item) => item.date === date)
  const chapter = rows<Chapter>(records, 'chapters')
    .filter((item) => records[`works/${item.workId}`] && !records[`works/${item.workId}`].deletedAt)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  return (
    <section className="home-page">
      <div className="home-opening">
        <p className="eyebrow">
          {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
        </p>
        <h1>
          生活有时很满，
          <br />
          这里可以慢一点。
        </h1>
        <div className="opening-landscape" aria-hidden="true">
          <i />
          <i />
          <span>隅</span>
        </div>
      </div>
      <div className="quick-grid">
        <button className="paper-card" onClick={() => go('diary')}>
          <Feather size={19} />
          <span>留一页日记</span>
        </button>
        <button className="paper-card" onClick={() => go('moods')}>
          <Smile size={19} />
          <span>此刻的心情</span>
        </button>
        <button className="paper-card" onClick={() => go('ideas')}>
          <Sparkles size={19} />
          <span>酝酿一个想法</span>
        </button>
      </div>
      <header className="section-heading">
        <div>
          <small className="eyebrow">TODAY</small>
          <h2>今天，记着这些</h2>
        </div>
        <button className="text-button" onClick={() => go('planner')}>
          安排 <ArrowUpRight size={15} />
        </button>
      </header>
      <div className="paper-card">
        <div className="today-summary">
          <span>{todos.filter((todo) => !isTodoCompletedOn(todo, date)).length} 件待办</span>
          <span>{assignments.weekly.length + assignments.once.length} 份待交</span>
        </div>
        {!todos.length && !appointments.length && <p className="muted">今天还留着空白，做点喜欢的事也好。</p>}
        {todos.slice(0, 5).map((todo) => (
          <article className="todo-row" key={todo.id}>
            <TodoCheck
              recordKey={`todos/${todo.id}`}
              value={todo as unknown as Record<string, unknown>}
              disabled={false}
            />
            <h3>{todo.title}</h3>
          </article>
        ))}
        {appointments.map((item) => (
          <p key={item.id} className="appointment">
            <time>{item.time || '今天'}</time>
            {item.title}
          </p>
        ))}
      </div>
      {chapter && (
        <button
          className="continue-writing paper-card"
          onClick={() => go('writing', `chapters/${chapter.id}`)}
        >
          <small className="eyebrow">接着上一次的思绪</small>
          <h3>{chapter.title}</h3>
          <p>
            {String(records[`works/${chapter.workId}`]?.title ?? '')} · {chapter.wordCount} 字
          </p>
          <span>继续写作 ↗</span>
        </button>
      )}
    </section>
  )
}
