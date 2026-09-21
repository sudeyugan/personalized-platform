import { useMemo } from 'react'
import type { MoodEntry, MoodKind, MoodPeriod, MoodPoints } from '../../domain/models'
import { formatLocalDate } from '../../domain/localDate'
import { moodOptions, moodPeriods } from './moodConfig'
import { MoodBlendBar } from './MoodBlendBar'

function rangeFor(referenceDate: string, range: 'week' | 'month') {
  const reference = new Date(`${referenceDate}T12:00:00`)
  if (range === 'month') {
    const start = new Date(reference.getFullYear(), reference.getMonth(), 1, 12)
    const end = new Date(reference.getFullYear(), reference.getMonth() + 1, 0, 12)
    return { start: formatLocalDate(start), end: formatLocalDate(end), expected: end.getDate() * 3 }
  }
  const start = new Date(reference)
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return { start: formatLocalDate(start), end: formatLocalDate(end), expected: 21 }
}

function totalsFor(entries: MoodEntry[]) {
  return entries.reduce<MoodPoints>((totals, entry) => {
    Object.entries(entry.points).forEach(([kind, count]) => { totals[kind as MoodKind] = (totals[kind as MoodKind] ?? 0) + (count ?? 0) })
    return totals
  }, {})
}

function datesBetween(start: string, end: string) {
  const dates: string[] = []
  const cursor = new Date(`${start}T12:00:00`)
  while (formatLocalDate(cursor) <= end) {
    dates.push(formatLocalDate(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

export function MoodStats({ entries, referenceDate, range }: { entries: MoodEntry[]; referenceDate: string; range: 'week' | 'month' }) {
  const stats = useMemo(() => {
    const bounds = rangeFor(referenceDate, range)
    const selected = entries.filter((entry) => entry.date >= bounds.start && entry.date <= bounds.end)
    const totals = totalsFor(selected)
    const totalPoints = Object.values(totals).reduce((sum, count) => sum + (count ?? 0), 0)
    const top = moodOptions.map((mood) => ({ ...mood, count: totals[mood.id] ?? 0 })).filter((mood) => mood.count).sort((a, b) => b.count - a.count).slice(0, 3)
    const byPeriod = Object.fromEntries(moodPeriods.map((period) => [period.id, totalsFor(selected.filter((entry) => entry.period === period.id))])) as Record<MoodPeriod, MoodPoints>
    return { ...bounds, selected, totals, totalPoints, top, byPeriod, dates: datesBetween(bounds.start, bounds.end) }
  }, [entries, range, referenceDate])

  return (
    <details className={`mood-stats ${range}`}>
      <summary><span>{range === 'week' ? '本周概览' : '本月情绪构成'}</span><strong>{stats.selected.length} / {stats.expected} 次记录</strong></summary>
      {stats.selected.length ? <div className="mood-stats-body">
        <MoodBlendBar points={stats.totals} />
        {range === 'week' && <div className="mood-week-grid">{stats.dates.map((date) => <div key={date}><span>{new Date(`${date}T12:00:00`).toLocaleDateString('zh-CN', { weekday: 'short' }).replace('周', '')}</span>{moodPeriods.map((period) => { const entry = stats.selected.find((item) => item.date === date && item.period === period.id); return entry ? <MoodBlendBar compact points={entry.points} key={period.id} /> : <i key={period.id} /> })}</div>)}</div>}
        <div className="mood-top-list">{stats.top.map((mood) => <span key={mood.id}><i style={{ background: mood.color }} />{mood.label}<b>{Math.round((mood.count / stats.totalPoints) * 100)}%</b></span>)}</div>
        <div className="mood-period-stats">{moodPeriods.map((period) => <div key={period.id}><span>{period.label}</span><MoodBlendBar compact points={stats.byPeriod[period.id]} /></div>)}</div>
      </div> : <p>这个范围内还没有心情记录。</p>}
    </details>
  )
}
