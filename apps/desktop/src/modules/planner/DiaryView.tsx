import { Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatLocalDate } from '../../domain/localDate'
import { useLibraryStore } from '../../state/useLibraryStore'
import { dayNumber } from './plannerDates'
import { scheduleDays } from './scheduleConstants'

export function DiaryView() {
  const { data, saveDiaryEntry, openDiary } = useLibraryStore()
  const [date, setDate] = useState(data.session.activeDiaryDate ?? formatLocalDate())
  const storedEntry = data.planner.diaryEntries.find((entry) => entry.date === date)
  const [title, setTitle] = useState(storedEntry?.title ?? '')
  const [content, setContent] = useState(storedEntry?.content ?? '')
  const [saved, setSaved] = useState(false)
  const weekday = dayNumber(date)

  useEffect(() => { setTitle(storedEntry?.title ?? ''); setContent(storedEntry?.content ?? ''); setSaved(false) }, [date, storedEntry?.title, storedEntry?.content])
  useEffect(() => { openDiary(date) }, [date, openDiary])
  const save = () => { saveDiaryEntry({ date, title: title.trim(), content, updatedAt: new Date().toISOString() }); setSaved(true) }

  return <main className="diary-view scroll-view"><header className="page-header"><div><p className="eyebrow">创作空间</p><h1>日记</h1><p>选择日期，安静地写下当天值得保留的内容。</p></div></header><div className="journal-layout"><section className="journal-editor"><div className="journal-date-row"><label>日期<input type="date" value={date} onChange={(event) => event.target.value && setDate(event.target.value)} /></label><span>{scheduleDays[weekday - 1]}</span></div><input className="journal-title" value={title} onChange={(event) => { setTitle(event.target.value); setSaved(false) }} placeholder="给今天一个标题" /><textarea value={content} onChange={(event) => { setContent(event.target.value); setSaved(false) }} placeholder="今天发生了什么？此刻有什么想记住的？" /><footer><small>{storedEntry ? `上次保存于 ${new Date(storedEntry.updatedAt).toLocaleString()}` : '这一天还没有日记'}</small><button className="primary-button" onClick={save}><Save size={14} />{saved ? '已保存' : '保存日记'}</button></footer></section></div></main>
}
