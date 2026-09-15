import { BookOpen, CalendarDays, Pencil, Plus, Save, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { Course, CourseDay, CoursePeriod } from '../../domain/models'
import { formatLocalDate } from '../../domain/localDate'
import { useLibraryStore } from '../../state/useLibraryStore'

const days = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日']
const periods = [
  { id: 1, label: '第1节', time: '8:00～9:35' }, { id: 2, label: '第2节', time: '9:50～12:15' },
  { id: 3, label: '第3节', time: '13:30～15:05' }, { id: 4, label: '第4节', time: '15:20～16:55' },
  { id: 5, label: '第5节', time: '17:05～18:40' }, { id: 6, label: '第6节', time: '19:20～21:45' },
] as const

type CourseDraft = Omit<Course, 'id'>
const emptyCourse = (): CourseDraft => ({ title: '', day: 1, period: 1, teacher: '', location: '', weeks: '全周', note: '' })

export function JournalScheduleView() {
  const { data, saveDiaryEntry, addCourse, updateCourse, deleteCourse } = useLibraryStore()
  const [mode, setMode] = useState<'journal' | 'schedule'>('journal')
  const [date, setDate] = useState(formatLocalDate())
  const storedEntry = data.planner.diaryEntries.find((entry) => entry.date === date)
  const [title, setTitle] = useState(storedEntry?.title ?? '')
  const [content, setContent] = useState(storedEntry?.content ?? '')
  const [saved, setSaved] = useState(false)
  const [editingId, setEditingId] = useState<string>()
  const [course, setCourse] = useState<CourseDraft>(emptyCourse)

  useEffect(() => { setTitle(storedEntry?.title ?? ''); setContent(storedEntry?.content ?? ''); setSaved(false) }, [date, storedEntry?.title, storedEntry?.content])
  const selectedDay = ((new Date(`${date}T12:00:00`).getDay() || 7)) as CourseDay
  const dayCourses = useMemo(() => data.planner.courses.filter((item) => item.day === selectedDay).sort((a, b) => a.period - b.period), [data.planner.courses, selectedDay])

  const saveJournal = () => {
    saveDiaryEntry({ date, title: title.trim(), content, updatedAt: new Date().toISOString() })
    setSaved(true)
  }
  const submitCourse = (event: FormEvent) => {
    event.preventDefault()
    if (!course.title.trim()) return
    const value = { ...course, title: course.title.trim() }
    if (editingId) updateCourse(editingId, value); else addCourse(value)
    setEditingId(undefined); setCourse(emptyCourse())
  }
  const editCourse = (item: Course) => { setEditingId(item.id); setCourse({ title: item.title, day: item.day, period: item.period, teacher: item.teacher, location: item.location, weeks: item.weeks, note: item.note }) }

  return <main className="planner-view scroll-view">
    <header className="page-header planner-header"><div><p className="eyebrow">日常与节奏</p><h1>日记与课表</h1><p>把一天写下来，也让每周固定的课程自然出现在当天。</p></div><div className="planner-tabs"><button className={mode === 'journal' ? 'active' : ''} onClick={() => setMode('journal')}><BookOpen size={15} />日记</button><button className={mode === 'schedule' ? 'active' : ''} onClick={() => setMode('schedule')}><CalendarDays size={15} />课表</button></div></header>
    {mode === 'journal' ? <div className="journal-layout">
      <section className="journal-editor"><div className="journal-date-row"><label>日期<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><span>{days[selectedDay - 1]}</span></div><input className="journal-title" value={title} onChange={(event) => { setTitle(event.target.value); setSaved(false) }} placeholder="给今天一个标题" /><textarea value={content} onChange={(event) => { setContent(event.target.value); setSaved(false) }} placeholder="今天发生了什么？此刻有什么想记住的？" /><footer><small>{storedEntry ? `上次保存于 ${new Date(storedEntry.updatedAt).toLocaleString()}` : '这一天还没有日记'}</small><button className="primary-button" onClick={saveJournal}><Save size={14} />{saved ? '已保存' : '保存日记'}</button></footer></section>
      <aside className="today-courses"><h2>{days[selectedDay - 1]}的课程</h2>{dayCourses.map((item) => <article key={item.id}><span>{periods[item.period - 1].time}</span><strong>{item.title}</strong><small>{[item.teacher, item.location].filter(Boolean).join(' · ') || item.weeks}</small></article>)}{dayCourses.length === 0 && <p>今天没有安排固定课程。</p>}</aside>
    </div> : <div className="schedule-layout">
      <section className="schedule-board"><div className="schedule-grid"><div className="schedule-corner" />{days.map((day) => <div className="schedule-day" key={day}>{day}</div>)}{periods.flatMap((period) => [<div className="schedule-period" key={`p-${period.id}`}><strong>{period.label}</strong><span>{period.time}</span></div>, ...days.map((_, index) => <div className="schedule-cell" key={`${period.id}-${index + 1}`}>{data.planner.courses.filter((item) => item.period === period.id && item.day === index + 1).map((item) => <button key={item.id} onClick={() => editCourse(item)}><strong>{item.title}</strong><span>{[item.teacher, item.location, item.weeks].filter(Boolean).join('；')}</span></button>)}</div>)])}</div></section>
      <form className="course-editor" onSubmit={submitCourse}><h2>{editingId ? '编辑课程' : '添加课程'}</h2><label>课程名称<input value={course.title} onChange={(event) => setCourse({ ...course, title: event.target.value })} placeholder="例如：专业课程实践" /></label><div><label>星期<select value={course.day} onChange={(event) => setCourse({ ...course, day: Number(event.target.value) as CourseDay })}>{days.map((day, index) => <option value={index + 1} key={day}>{day}</option>)}</select></label><label>节次<select value={course.period} onChange={(event) => setCourse({ ...course, period: Number(event.target.value) as CoursePeriod })}>{periods.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label></div><label>教师<input value={course.teacher} onChange={(event) => setCourse({ ...course, teacher: event.target.value })} /></label><label>地点<input value={course.location} onChange={(event) => setCourse({ ...course, location: event.target.value })} /></label><label>周次<input value={course.weeks} onChange={(event) => setCourse({ ...course, weeks: event.target.value })} placeholder="全周或 1-11周" /></label><label>备注<textarea value={course.note} onChange={(event) => setCourse({ ...course, note: event.target.value })} rows={2} /></label><div className="course-actions"><button className="primary-button" type="submit">{editingId ? <Pencil size={14} /> : <Plus size={14} />}{editingId ? '保存修改' : '加入课表'}</button>{editingId && <><button className="ghost-button" type="button" onClick={() => { setEditingId(undefined); setCourse(emptyCourse()) }}>取消</button><button className="danger-button" type="button" onClick={() => { deleteCourse(editingId); setEditingId(undefined); setCourse(emptyCourse()) }}><Trash2 size={14} />删除</button></>}</div></form>
    </div>}
  </main>
}
