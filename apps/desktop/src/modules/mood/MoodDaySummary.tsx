import type { MoodEntry } from '../../domain/models'
import { MoodBlendBar } from './MoodBlendBar'
import { moodPeriods } from './moodConfig'
import { moodSummary } from './moodUtils'

export function MoodDaySummary({ entries }: { entries: MoodEntry[] }) {
  return (
    <section className="mood-day-summary">
      <h3>心情</h3>
      {moodPeriods.map((period) => {
        const entry = entries.find((item) => item.period === period.id)
        return <div className={entry ? 'recorded' : ''} key={period.id}><span>{period.label}</span>{entry ? <><MoodBlendBar compact points={entry.points} /><small>{moodSummary(entry.points)}</small>{entry.note && <p>{entry.note}</p>}</> : <small>未记录</small>}</div>
      })}
      <small className="mood-readonly-hint">心情请在首页记录和修改</small>
    </section>
  )
}
