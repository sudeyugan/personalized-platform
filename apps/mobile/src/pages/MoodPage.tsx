import { useState } from 'react'
import type { Records } from '@yiyu/sync'
import type { MoodEntry, MoodPoints, MoodPeriod } from '../../../desktop/src/domain/models'
import { currentMoodPeriod, moodOptions, moodPeriods } from '../../../desktop/src/modules/mood/moodConfig'
import { ReflectionVisualizations } from '../../../desktop/src/modules/mood/visualizations/ReflectionVisualizations'
import { MoodBlendBar } from '../../../desktop/src/modules/mood/MoodBlendBar'
import { moodSummary } from '../../../desktop/src/modules/mood/moodUtils'
import { datesFor, shiftReflectionDate } from '../../../desktop/src/modules/mood/moodReflectionDates'
import { rows, today } from '../data'
import { update } from '../repository'
import type { Action } from './HomePage'
export default function MoodPage({ records, action }: { records: Records; action: Action }) {
  const [date, setDate] = useState(today()),
    [period, setPeriod] = useState<MoodPeriod>(currentMoodPeriod)
  const [points, setPoints] = useState<MoodPoints>({}),
    [range, setRange] = useState<'week' | 'month'>('week'),
    [reference, setReference] = useState(today())
  const [saving, setSaving] = useState(false)
  const total = Object.values(points).reduce((sum, value) => sum + (value ?? 0), 0),
    entries = rows<MoodEntry>(records, 'moods')
  const dates = datesFor(reference, range),
    dayEntries = entries.filter((item) => item.date === date)
  return (
    <section className="mood-page">
      <p className="eyebrow">不急着解释，只给感受一点位置</p>
      <h1>此刻，是什么颜色？</h1>
      <label>
        记录日期
        <input
          type="date"
          value={date}
          max={today()}
          onChange={(event) => {
            setDate(event.target.value)
            setPoints({})
          }}
        />
      </label>
      <div className="segments">
        {moodPeriods.map((item) => (
          <button
            aria-pressed={period === item.id}
            key={item.id}
            onClick={() => {
              setPeriod(item.id)
              setPoints({})
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <section className="paper-card mood-entry">
        <header className="section-heading">
          <h3>分给心情的五点</h3>
          <span>{total} / 5</span>
        </header>
        <div className="mood-grid">
          {moodOptions.map((mood) => (
            <button
              aria-label={`${mood.label} ${points[mood.id] ?? 0}点`}
              key={mood.id}
              disabled={saving || (total >= 5 && !points[mood.id])}
              style={{ '--mood-color': mood.color } as React.CSSProperties}
              onClick={() =>
                setPoints((current) => ({
                  ...current,
                  [mood.id]: total < 5 ? (current[mood.id] ?? 0) + 1 : 0,
                }))
              }
            >
              <i />
              <span>{mood.label}</span>
              <small>{points[mood.id] ? '●'.repeat(points[mood.id]!) : '·'}</small>
            </button>
          ))}
        </div>
        <p className="footnote">轻点加一点；五点分完后，再点已选心情可清除它。</p>
        <div className="toolbar">
          <button disabled={saving} onClick={() => setPoints({})}>
            重新分配
          </button>
          <button
            className="primary"
            disabled={total !== 5 || saving || !date || date > today()}
            onClick={() => {
              setSaving(true)
              void action(async () => {
                const key = `moods/${date}-${period}`,
                  existing = records[key]
                if (existing && !confirm('这个时段已经留下五点，要替换吗？')) return
                const now = new Date().toISOString()
                await update(key, {
                  ...existing,
                  id: `${date}-${period}`,
                  date,
                  period,
                  points,
                  createdAt: existing?.createdAt ?? now,
                  updatedAt: now,
                })
                setPoints({})
              }).finally(() => setSaving(false))
            }}
          >
            记下五点
          </button>
        </div>
      </section>
      <header className="section-heading">
        <h2>回望，不下结论</h2>
        <div className="segments">
          <button aria-pressed={range === 'week'} onClick={() => setRange('week')}>
            周
          </button>
          <button aria-pressed={range === 'month'} onClick={() => setRange('month')}>
            月
          </button>
        </div>
      </header>
      <div className="month-heading">
        <button aria-label="前一段" onClick={() => setReference(shiftReflectionDate(reference, range, -1))}>
          ←
        </button>
        <span>
          {dates[0]} — {dates.at(-1)}
        </span>
        <button aria-label="后一段" onClick={() => setReference(shiftReflectionDate(reference, range, 1))}>
          →
        </button>
      </div>
      <ReflectionVisualizations dates={dates} entries={entries} activeDate={date} onChooseDate={setDate}>
        <div className="mood-ribbons">
          {dates.map((day) => (
            <button key={day} aria-pressed={day === date} onClick={() => setDate(day)}>
              <time>{day.slice(5)}</time>
              {moodPeriods.map((period) => {
                const item = entries.find((entry) => entry.date === day && entry.period === period.id)
                return item ? (
                  <MoodBlendBar key={period.id} points={item.points} compact />
                ) : (
                  <span key={period.id} className="missing-mood" title={`${period.label}未记录`} />
                )
              })}
            </button>
          ))}
        </div>
      </ReflectionVisualizations>
      <section className="paper-card">
        <h3>{date} 的原始记录</h3>
        {dayEntries.length ? (
          dayEntries.map((entry) => (
            <div className="mood-detail" key={entry.id}>
              <span>{moodPeriods.find((item) => item.id === entry.period)?.label}</span>
              <MoodBlendBar points={entry.points} />
              <p>{moodSummary(entry.points)}</p>
              {entry.note && <p>{entry.note}</p>}
            </div>
          ))
        ) : (
          <p className="muted">这一天还没有记录，不推断未记录的心情。</p>
        )}
      </section>
    </section>
  )
}
