import { Save } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { formatLocalDate } from '../../domain/localDate'
import { useLibraryStore } from '../../state/useLibraryStore'
import { dayNumber } from './plannerDates'
import { scheduleDays } from './scheduleConstants'

type SaveStatus = 'saved' | 'dirty' | 'saving'

export function DiaryView() {
  const { data, saveDiaryEntry, openDiary } = useLibraryStore()
  const initialDate = data.session.activeDiaryDate ?? formatLocalDate()
  const initialEntry = data.planner.diaryEntries.find((entry) => entry.date === initialDate)
  const [date, setDate] = useState(initialDate)
  const [title, setTitle] = useState(initialEntry?.title ?? '')
  const [content, setContent] = useState(initialEntry?.content ?? '')
  const [status, setStatus] = useState<SaveStatus>('saved')
  const [lastSavedAt, setLastSavedAt] = useState(initialEntry?.updatedAt)
  const draftRef = useRef({ date: initialDate, title: initialEntry?.title ?? '', content: initialEntry?.content ?? '', dirty: false })
  const saveDiaryEntryRef = useRef(saveDiaryEntry)
  const weekday = dayNumber(date)

  const persist = useCallback((draft = { date, title, content }) => {
    if (!draft.title.trim() && !draft.content.trim() && !data.planner.diaryEntries.some((entry) => entry.date === draft.date)) {
      draftRef.current = { ...draft, dirty: false }
      setLastSavedAt(undefined)
      setStatus('saved')
      return
    }
    setStatus('saving')
    const updatedAt = new Date().toISOString()
    saveDiaryEntry({ date: draft.date, title: draft.title.trim(), content: draft.content, updatedAt })
    draftRef.current = { ...draft, dirty: false }
    setLastSavedAt(updatedAt)
    setStatus('saved')
  }, [content, data.planner.diaryEntries, date, saveDiaryEntry, title])

  const markDirty = (nextTitle: string, nextContent: string) => {
    draftRef.current = { date, title: nextTitle, content: nextContent, dirty: true }
    setStatus('dirty')
  }

  const changeDate = (nextDate: string) => {
    if (draftRef.current.dirty) persist(draftRef.current)
    const nextEntry = data.planner.diaryEntries.find((entry) => entry.date === nextDate)
    const nextTitle = nextEntry?.title ?? ''
    const nextContent = nextEntry?.content ?? ''
    setDate(nextDate)
    setTitle(nextTitle)
    setContent(nextContent)
    setLastSavedAt(nextEntry?.updatedAt)
    setStatus('saved')
    draftRef.current = { date: nextDate, title: nextTitle, content: nextContent, dirty: false }
  }

  useEffect(() => { openDiary(date) }, [date, openDiary])
  useEffect(() => { saveDiaryEntryRef.current = saveDiaryEntry }, [saveDiaryEntry])
  useEffect(() => {
    if (status !== 'dirty') return
    const timer = window.setTimeout(() => persist(), 700)
    return () => window.clearTimeout(timer)
  }, [content, persist, status, title])
  useEffect(() => () => {
    const draft = draftRef.current
    if (!draft.dirty || (!draft.title.trim() && !draft.content.trim())) return
    saveDiaryEntryRef.current({ date: draft.date, title: draft.title.trim(), content: draft.content, updatedAt: new Date().toISOString() })
  }, [])

  const saveHint = status === 'saving'
    ? '正在保存…'
    : status === 'dirty'
      ? '停止输入后将自动保存'
      : lastSavedAt
        ? `已保存于 ${new Date(lastSavedAt).toLocaleString()}`
        : '这一天还没有日记'

  return <main className="diary-view scroll-view"><header className="page-header"><div><p className="eyebrow">创作空间</p><h1>日记</h1><p>选择日期，安静地写下当天值得保留的内容。</p></div></header><div className="journal-layout"><section className="journal-editor"><div className="journal-date-row"><label>日期<input type="date" value={date} onChange={(event) => event.target.value && changeDate(event.target.value)} /></label><span>{scheduleDays[weekday - 1]}</span></div><input className="journal-title" value={title} onChange={(event) => { const next = event.target.value; setTitle(next); markDirty(next, content) }} placeholder="给今天一个标题" /><textarea value={content} onChange={(event) => { const next = event.target.value; setContent(next); markDirty(title, next) }} placeholder="今天发生了什么？此刻有什么想记住的？" /><footer><small>{saveHint}</small><button type="button" className="primary-button" disabled={status !== 'dirty'} onClick={() => persist()}><Save size={14} />{status === 'saving' ? '保存中…' : status === 'saved' ? '已保存' : '立即保存'}</button></footer></section></div></main>
}
