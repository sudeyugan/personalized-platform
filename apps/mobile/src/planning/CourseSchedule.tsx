import { useState } from 'react'
import type { Course } from '../../../desktop/src/domain/models'
import { courseIncludesWeek } from '../../../desktop/src/modules/planner/plannerDates'

export function CourseSchedule({ courses, edit }: { courses: Course[]; edit(course: Course): void }) {
  const today = new Date().getDay() || 7
  const [week, setWeek] = useState(''), [compact, setCompact] = useState(false), [day, setDay] = useState(today)
  const start = Math.min(5, Math.max(1, day - 1))
  const days = Array.from({ length: compact ? 3 : 7 }, (_, i) => compact ? start + i : i + 1)
  const visible = courses.filter(course => !week || courseIncludesWeek(course, Number(week)))
  return <section className="course-schedule" aria-label="周课表">
    <div className="schedule-controls">
      <label>教学周<select aria-label="课表教学周" value={week} onChange={event => setWeek(event.target.value)}><option value="">全部周次</option>{Array.from({ length: 30 }, (_, i) => <option key={i} value={i + 1}>第 {i + 1} 周</option>)}</select></label>
      <button className="text-button" aria-pressed={compact} onClick={() => setCompact(!compact)}>{compact ? '展开整周' : '聚焦三天'}</button>
    </div>
    {compact && <div className="schedule-day-picker" aria-label="聚焦星期">{'一二三四五六日'.split('').map((label, i) => <button key={label} aria-pressed={day === i + 1} onClick={() => setDay(i + 1)}>周{label}</button>)}</div>}
    <details className="schedule-help"><summary>周次与查看说明</summary><p className="footnote">{week ? `正在查看第 ${week} 周。` : '未推测当前教学周；可手动选择。'}同格多课程完整保留，点课程编辑；聚焦三天可放大阅读。</p></details>
    <div className={'schedule-scroll' + (compact ? ' compact' : '')} tabIndex={0} aria-label="可横向浏览的课表网格">
      <table className="schedule-table">
        <caption className="sr-only">星期与课节交叉的周课表</caption>
        <thead><tr><th scope="col">课节</th>{days.map(value => <th scope="col" key={value} data-today={value === today || undefined}>周{'一二三四五六日'[value - 1]}{value === today && <small>今天</small>}</th>)}</tr></thead>
        <tbody>{Array.from({ length: 6 }, (_, i) => i + 1).map(period => <tr key={period}><th scope="row"><span>{String(period).padStart(2, '0')}</span><small>课节</small></th>{days.map(value => {
          const cell = visible.filter(course => course.day === value && course.period === period)
          return <td key={value} data-today={value === today || undefined}>{cell.length ? cell.map(course => <button className="schedule-course" key={course.id} onClick={() => edit(course)} aria-label={`周${'一二三四五六日'[value - 1]}第${period}节 ${course.title}`}><strong>{course.title}</strong><span>{course.location || '教室待定'}</span><small>{course.weeks || '全周'}</small></button>) : <span className="schedule-blank" aria-label="无课程">·</span>}</td>
        })}</tr>)}</tbody>
      </table>
    </div>
    {!visible.length && <p className="empty small-empty">{courses.length ? '所选周次没有课程，其他周次仍保留。' : '课表还是空白，可以先添加一门课。'}</p>}
  </section>
}
