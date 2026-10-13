import type { CSSProperties } from 'react'
import { bubbleDiameter, dayLabel, emotionDistribution, shortDate, type ReflectionChartProps } from './reflectionData'

export function BubbleMatrix({ days, activeDate, onChooseDate }: ReflectionChartProps) {
  return <div className="mood-viz-scroll">
    <div className="mood-bubble-matrix" style={{ gridTemplateColumns: `54px repeat(${days.length}, minmax(32px, 1fr))` }}>
      <span />{days.map((day) => <button type="button" key={day.date} title={dayLabel(day)} aria-label={`查看 ${day.date} 的心情`} aria-pressed={day.date === activeDate} onClick={() => onChooseDate(day.date)}>{shortDate(day.date)}</button>)}
      {emotionDistribution(days).filter((mood) => mood.points).map((mood) => <div className="mood-bubble-row" key={mood.id}>
        <strong><i style={{ background: mood.color }} />{mood.label}</strong>
        {days.map((day) => {
          const count = day.total ? day.points[mood.id] ?? 0 : null
          const label = `${day.date} ${mood.label}：${count === null ? '未记录' : `${count} 点；${day.entries.length}/3 个时段`}`
          return <button type="button" key={day.date} className={`mood-bubble-cell ${count === null ? 'mood-viz-missing' : ''}`} title={label} aria-label={label} aria-pressed={day.date === activeDate} onClick={() => onChooseDate(day.date)}>
            {count === null ? <span aria-hidden="true">—</span> : count > 0 ? <i aria-hidden="true" style={{ '--bubble-size': `${bubbleDiameter(count / 15)}px`, background: mood.color } as CSSProperties} /> : <span aria-hidden="true">·</span>}
          </button>
        })}
      </div>)}
      <small>时段</small>{days.map((day) => <small key={day.date}>{day.entries.length}/3</small>)}
    </div>
    <p className="mood-viz-caption">圆的面积表示实际点数，所有日期共用 0—15 点刻度；只记录一个时段也不放大。· 为 0 点，— 为未记录；仅展示本段非零情绪。</p>
  </div>
}
