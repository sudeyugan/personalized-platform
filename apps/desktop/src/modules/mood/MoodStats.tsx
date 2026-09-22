import { useMemo, useState, type CSSProperties } from 'react'
import type { MoodEntry, MoodKind, MoodPeriod, MoodPoints } from '../../domain/models'
import { formatLocalDate } from '../../domain/localDate'
import { moodOptions, moodPeriods } from './moodConfig'
import { MoodBlendBar } from './MoodBlendBar'
import { moodSummary } from './moodUtils'

type ReflectionRange = 'week' | 'month'

function datesFor(referenceDate: string, range: ReflectionRange) {
  const reference = new Date(`${referenceDate}T12:00:00`)
  const start = range === 'month'
    ? new Date(reference.getFullYear(), reference.getMonth(), 1, 12)
    : new Date(reference)
  if (range === 'week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  const end = range === 'month'
    ? new Date(reference.getFullYear(), reference.getMonth() + 1, 0, 12)
    : new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 12)
  const dates: string[] = []
  const cursor = new Date(start)
  while (cursor <= end) {
    dates.push(formatLocalDate(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

function totalsFor(entries: MoodEntry[]) {
  return entries.reduce<MoodPoints>((totals, entry) => {
    Object.entries(entry.points).forEach(([kind, count]) => {
      totals[kind as MoodKind] = (totals[kind as MoodKind] ?? 0) + (count ?? 0)
    })
    return totals
  }, {})
}

function availableSlots(dates: string[], referenceDate: string) {
  const today = formatLocalDate()
  if (referenceDate < today) return dates.length * moodPeriods.length
  if (referenceDate > today) return 0
  const hour = new Date().getHours()
  const currentPeriod = hour < 12 ? 1 : hour < 18 ? 2 : 3
  return dates.reduce((count, date) => count + (date < today ? 3 : date === today ? currentPeriod : 0), 0)
}

function PeriodCell({ entry }: { entry?: MoodEntry }) {
  return entry
    ? <MoodBlendBar compact points={entry.points} />
    : <span className="mood-reflection-empty" aria-label="未记录" />
}

export function MoodStats({ entries, referenceDate, range }: { entries: MoodEntry[]; referenceDate: string; range?: ReflectionRange }) {
  if (range) return null
  return <MoodReflection entries={entries} referenceDate={referenceDate} />
}

function MoodReflection({ entries, referenceDate }: { entries: MoodEntry[]; referenceDate: string }) {
  const [range, setRange] = useState<ReflectionRange>('week')
  const stats = useMemo(() => {
    const dates = datesFor(referenceDate, range)
    const dateSet = new Set(dates)
    const selected = entries.filter((entry) => dateSet.has(entry.date))
    const totals = totalsFor(selected)
    const totalPoints = Object.values(totals).reduce((sum, count) => sum + (count ?? 0), 0)
    const composition = moodOptions
      .map((mood) => ({ ...mood, count: totals[mood.id] ?? 0 }))
      .filter((mood) => mood.count)
      .sort((a, b) => b.count - a.count)
      .slice(0, range === 'month' ? 7 : 3)
    const byPeriod = Object.fromEntries(moodPeriods.map((period) => [
      period.id,
      totalsFor(selected.filter((entry) => entry.period === period.id)),
    ])) as Record<MoodPeriod, MoodPoints>
    return { dates, selected, totals, totalPoints, composition, byPeriod, expected: availableSlots(dates, referenceDate) }
  }, [entries, range, referenceDate])

  const entryFor = (date: string, period: MoodPeriod) => stats.selected.find((entry) => entry.date === date && entry.period === period)
  const firstWeekday = new Date(`${stats.dates[0]}T12:00:00`).getDay()
  const monthOffset = firstWeekday === 0 ? 7 : firstWeekday

  return (
    <details className="mood-stats">
      <summary><span>情绪回望</span><strong>看看情绪如何经过这一段时间</strong></summary>
      <div className="mood-stats-body">
        <header className="mood-reflection-header">
          <div className="mood-range-switch" aria-label="选择情绪回望范围">
            <button type="button" className={range === 'week' ? 'active' : ''} aria-pressed={range === 'week'} onClick={() => setRange('week')}>本周</button>
            <button type="button" className={range === 'month' ? 'active' : ''} aria-pressed={range === 'month'} onClick={() => setRange('month')}>本月</button>
          </div>
          <span>已记录 {stats.selected.length} / {stats.expected} 个可记录时段</span>
        </header>

        {stats.selected.length ? <>
          <section className="mood-overall-tone" aria-label={`${range === 'week' ? '本周' : '本月'}情绪底色`}>
            <div><span>{range === 'week' ? '本周' : '本月'}情绪底色</span><small>{moodSummary(stats.totals)}</small></div>
            <MoodBlendBar points={stats.totals} />
          </section>

          {range === 'week' ? <section className="mood-week-tapestry" aria-label="本周早中晚情绪织带">
            <span />
            {stats.dates.map((date) => <strong key={date}>{new Date(`${date}T12:00:00`).toLocaleDateString('zh-CN', { weekday: 'short' }).replace('周', '')}</strong>)}
            {moodPeriods.map((period) => <div className="mood-week-row" key={period.id}>
              <b>{period.label}</b>
              {stats.dates.map((date) => <PeriodCell entry={entryFor(date, period.id)} key={date} />)}
            </div>)}
          </section> : <section className="mood-month-calendar" aria-label="本月情绪日历">
            {['一', '二', '三', '四', '五', '六', '日'].map((day) => <strong key={day}>{day}</strong>)}
            {stats.dates.map((date, index) => {
              const dayEntries = stats.selected.filter((entry) => entry.date === date)
              const isFuture = date > formatLocalDate()
              return <div className={isFuture ? 'future' : ''} style={index === 0 ? { gridColumnStart: monthOffset } : undefined} title={dayEntries.length ? `${date}：${dayEntries.length} 个时段` : date} key={date}>
                <span>{Number(date.slice(-2))}</span>
                <i>{moodPeriods.map((period) => <PeriodCell entry={entryFor(date, period.id)} key={period.id} />)}</i>
              </div>
            })}
          </section>}

          <section className="mood-composition">
            <header><span>主要情绪</span><small>按五枚心情点累计</small></header>
            {stats.composition.map((mood) => {
              const share = Math.round((mood.count / stats.totalPoints) * 100)
              return <div style={{ '--mood-color': mood.color, '--mood-share': `${share}%` } as CSSProperties} key={mood.id}>
                <span><i />{mood.label}</span><b>{share}%</b><em />
              </div>
            })}
          </section>

          <section className="mood-period-stats" aria-label="早中晚情绪构成">
            {moodPeriods.map((period) => <div key={period.id}><span>{period.label}</span><MoodBlendBar compact points={stats.byPeriod[period.id]} /><small>{moodSummary(stats.byPeriod[period.id]) || '未记录'}</small></div>)}
          </section>
        </> : <p>这个范围内还没有心情记录。</p>}
      </div>
    </details>
  )
}
