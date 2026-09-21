import { Check, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { MoodEntry, MoodKind, MoodPeriod } from '../../domain/models'
import { MoodBlendBar } from './MoodBlendBar'
import { MoodStats } from './MoodStats'
import { currentMoodPeriod, moodByKind, moodOptions, moodPeriodById, moodPeriods } from './moodConfig'
import { collapseMoodPoints, expandMoodPoints, moodGradientStyle, moodSummary } from './moodUtils'

export function HomeMoodCard({ date, entries, onSave, onDelete }: {
  date: string
  entries: MoodEntry[]
  onSave: (entry: Pick<MoodEntry, 'date' | 'period' | 'points' | 'note'>) => void
  onDelete: (id: string) => void
}) {
  const [day, setDay] = useState<'today' | 'yesterday'>('today')
  const [editing, setEditing] = useState<MoodPeriod>()
  const [allocation, setAllocation] = useState<MoodKind[]>([])
  const [note, setNote] = useState('')
  const yesterday = useMemo(() => {
    const value = new Date(`${date}T12:00:00`)
    value.setDate(value.getDate() - 1)
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  }, [date])
  const targetDate = day === 'today' ? date : yesterday
  const dayEntries = entries.filter((entry) => entry.date === targetDate)
  const dayPoints = useMemo(() => dayEntries.reduce((points, entry) => {
    Object.entries(entry.points).forEach(([kind, count]) => { points[kind as MoodKind] = (points[kind as MoodKind] ?? 0) + (count ?? 0) })
    return points
  }, {} as MoodEntry['points']), [dayEntries])

  const begin = (period: MoodPeriod) => {
    const entry = dayEntries.find((item) => item.period === period)
    setEditing(period)
    setAllocation(entry ? expandMoodPoints(entry.points) : [])
    setNote(entry?.note ?? '')
  }
  const close = () => { setEditing(undefined); setAllocation([]); setNote('') }
  const save = () => {
    if (!editing || allocation.length !== 5) return
    onSave({ date: targetDate, period: editing, points: collapseMoodPoints(allocation), note })
    close()
  }
  const suggested = currentMoodPeriod()

  return (
    <section className="home-mood-card">
      <header>
        <div><p className="eyebrow">{day === 'today' ? '今日心情' : '补记昨天'}</p><h2>把五枚心情点，分给真实的此刻</h2></div>
        <div className="mood-day-switch" aria-label="选择心情记录日期">
          <button type="button" className={day === 'today' ? 'active' : ''} aria-pressed={day === 'today'} onClick={() => { close(); setDay('today') }}>今天</button>
          <button type="button" className={day === 'yesterday' ? 'active' : ''} aria-pressed={day === 'yesterday'} onClick={() => { close(); setDay('yesterday') }}>昨天</button>
        </div>
        {dayEntries.length > 0 && <div className="mood-aura" style={moodGradientStyle(dayPoints)} aria-hidden="true" />}
      </header>
      <div className="home-mood-periods">
        {moodPeriods.map((period) => {
          const entry = dayEntries.find((item) => item.period === period.id)
          return <article className={day === 'today' && period.id === suggested ? 'suggested' : ''} key={period.id}><div><strong>{period.label}</strong><small>{entry ? moodSummary(entry.points) : period.range}</small></div>{entry ? <MoodBlendBar points={entry.points} /> : <span className="mood-empty-bar" />}<button type="button" onClick={() => begin(period.id)}>{entry ? <Pencil size={13} /> : <Plus size={13} />}{entry ? '修改' : '记录'}</button></article>
        })}
      </div>

      {editing && <div className="mood-editor">
        <header><div><span>{moodPeriodById[editing].label}</span><strong>还可以分配 {5 - allocation.length} 点</strong></div><button type="button" aria-label="关闭心情编辑" onClick={close}><X size={15} /></button></header>
        <div className="mood-point-slots" aria-label="已经分配的五枚心情点">
          {Array.from({ length: 5 }, (_, index) => {
            const kind = allocation[index]
            return <button type="button" className={kind ? 'filled' : ''} style={kind ? { '--mood-color': moodByKind[kind].color, '--mood-ink': moodByKind[kind].ink } as React.CSSProperties : undefined} aria-label={kind ? `移除一份${moodByKind[kind].label}` : '尚未分配'} key={index} onClick={() => kind && setAllocation((items) => items.filter((_, itemIndex) => itemIndex !== index))}>{kind ? moodByKind[kind].label.slice(0, 1) : index + 1}</button>
          })}
        </div>
        <div className="mood-choice-grid">{moodOptions.map((mood) => <button type="button" style={{ '--mood-color': mood.color } as React.CSSProperties} disabled={allocation.length >= 5} key={mood.id} onClick={() => setAllocation((items) => [...items, mood.id])}><i />{mood.label}<b>{allocation.filter((kind) => kind === mood.id).length || ''}</b></button>)}</div>
        <input maxLength={80} value={note} onChange={(event) => setNote(event.target.value)} placeholder="想补充一句吗？（可选）" />
        <footer>
          <div>{allocation.length > 0 && <button type="button" onClick={() => setAllocation([])}><RotateCcw size={13} />重新分配</button>}{dayEntries.find((entry) => entry.period === editing) && <button type="button" className="mood-clear" onClick={() => { const entry = dayEntries.find((item) => item.period === editing); if (entry) onDelete(entry.id); close() }}><Trash2 size={13} />清除记录</button>}</div>
          <button type="button" className="primary-button" disabled={allocation.length !== 5} onClick={save}><Check size={14} />保存五点心情</button>
        </footer>
      </div>}
      <MoodStats entries={entries} referenceDate={date} range="week" />
    </section>
  )
}
