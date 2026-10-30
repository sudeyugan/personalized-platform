import type { CalendarEvent } from '../../../desktop/src/domain/models'
import { calendarDates } from '../../../desktop/src/modules/planner/plannerDates'
import { today } from '../data'

export function CalendarAgenda({ appointments, date, month, setDate, setMonth, edit, remove }: {
  appointments: CalendarEvent[]; date: string; month: Date
  setDate(date: string): void; setMonth(month: Date): void
  edit(item: CalendarEvent): void; remove(key: string): void
}) {
  const selected = appointments.filter(item => item.date === date).sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
  return <div className="calendar-workspace">
    <section className="calendar-month" aria-label="月历">
      <div className="month-heading">
        <button aria-label="上个月" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>←</button>
        <h3>{month.getFullYear()} 年 {month.getMonth() + 1} 月</h3>
        <button aria-label="下个月" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>→</button>
      </div>
      <div className="month-grid">
        {'一二三四五六日'.split('').map(day => <small key={day}>{day}</small>)}
        {calendarDates(month).map(day => {
          const key = day.toLocaleDateString('sv-SE'), events = appointments.filter(item => item.date === key)
          return <button className={day.getMonth() !== month.getMonth() ? 'outside-month' : ''} aria-pressed={date === key} aria-label={key} key={key} onClick={() => setDate(key)}>
            <span className="calendar-day-number">{day.getDate()}</span>
            {!!events.length && <i/>}
            <span className="calendar-day-notes" aria-hidden="true">{events.slice(0, 2).map(item => <span key={item.id}>{item.title}</span>)}{events.length > 2 && <small>另有 {events.length - 2} 项</small>}</span>
          </button>
        })}
      </div>
    </section>
    <section className="calendar-agenda" aria-label="当天日程">
      <header className="section-heading"><h3>{date}</h3><button className="text-button" onClick={() => { setDate(today()); setMonth(new Date()) }}>回到今天</button></header>
      <div className="day-agenda">
        {selected.map(item => <article className="paper-card" key={item.id}>
          <small>{item.time || '全天'}</small><h3>{item.title}</h3><p>{item.note}</p>
          <div className="toolbar"><button onClick={() => edit(item)}>编辑</button><button onClick={() => remove(`calendar/${item.id}`)}>移除</button></div>
        </article>)}
        {!selected.length && <p className="empty small-empty">这一天没有日程，留一段自由的时间。</p>}
      </div>
    </section>
  </div>
}
