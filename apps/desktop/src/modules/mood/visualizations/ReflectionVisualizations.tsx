import { useMemo, useState, type ReactNode } from 'react'
import type { MoodEntry } from '../../../domain/models'
import { moodOptions } from '../moodConfig'
import { BubbleMatrix } from './BubbleMatrix'
import { dayLabel, emotionDistribution, reflectionDays, shortDate } from './reflectionData'
import './reflectionVisualizations.css'

export const reflectionViews = [
  { id: 'bubbles', label: '气泡矩阵', hint: '看情绪在整段时间中的落点，圆面积表示实际点数。' },
  { id: 'original', label: '色带', hint: '用渐变色带回看每天早中晚的心情与整段时间的情绪构成。' },
] as const
type ReflectionView = typeof reflectionViews[number]['id']
export const reflectionViewKey = 'yiyu.mood.reflection-view.v1'
function initialView(): ReflectionView {
  try {
    const stored = localStorage.getItem(reflectionViewKey)
    return reflectionViews.find((view) => view.id === stored)?.id ?? 'bubbles'
  } catch { return 'bubbles' }
}

interface Props {
  dates: string[]
  entries: MoodEntry[]
  activeDate: string
  onChooseDate: (date: string) => void
  children: ReactNode
}

export function ReflectionVisualizations({ dates, entries, activeDate, onChooseDate, children }: Props) {
  const [view, setView] = useState<ReflectionView>(initialView)
  const days = useMemo(() => reflectionDays(dates, entries), [dates, entries])
  const chooseView = (next: ReflectionView) => {
    setView(next)
    try { localStorage.setItem(reflectionViewKey, next) } catch { /* A view preference is optional. */ }
  }
  const chartProps = { days, activeDate, onChooseDate }
  const emotions = emotionDistribution(days)
  const absent = emotions.filter((mood) => !mood.points)
  return <section className="mood-visualization-lab" aria-label="情绪回望可视化">
    <header className="mood-viz-heading"><span>回望视图</span></header>
    <div className="mood-viz-switch" role="group" aria-label="选择情绪可视化">{reflectionViews.map((option) => <button type="button" key={option.id} aria-pressed={view === option.id} onClick={() => chooseView(option.id)}>{option.label}</button>)}</div>
    <div className="mood-viz-introduction"><p>{reflectionViews.find((option) => option.id === view)!.hint}</p></div>
    {view === 'original' ? <div className="mood-viz-original">{children}</div> : <div className="mood-viz-chart" aria-label={reflectionViews.find((option) => option.id === view)!.label}>
      {!days.some((day) => day.total) && <p className="mood-viz-caption">这个范围内还没有心情记录。</p>}
      <BubbleMatrix {...chartProps} />
      <div className="mood-viz-color-key" aria-label="情绪颜色图例">{moodOptions.filter((mood) => emotions.some((item) => item.id === mood.id && item.points)).map((mood) => <span key={mood.id}><i style={{ background: mood.color }} />{mood.label}</span>)}</div>
      {absent.length > 0 && days.some((day) => day.total) && <details className="mood-viz-absent"><summary>本段记录中未出现的 {absent.length} 种情绪</summary><p>{absent.map((mood) => mood.label).join(' · ')}。仅指已记录时段，不推断未记录的日子。</p></details>}
      <details className="mood-viz-record-picker"><summary>按日期查看原始记录</summary><div className="mood-viz-day-picker" role="group" aria-label="选择详情日期">{days.map((day) => <button type="button" key={day.date} title={dayLabel(day)} aria-label={`选择详情 ${day.date}`} aria-pressed={day.date === activeDate} onClick={() => onChooseDate(day.date)}>{shortDate(day.date)}</button>)}</div></details>
    </div>}
  </section>
}
