import type { MoodEntry, MoodPoints } from '../../../domain/models'
import { moodCatalog, moodOptions } from '../moodConfig'
import { moodPointTotal, moodSummary } from '../moodUtils'

export interface ReflectionDay {
  date: string
  entries: MoodEntry[]
  points: MoodPoints
  total: number
}

export interface ReflectionChartProps {
  days: ReflectionDay[]
  activeDate: string
  onChooseDate: (date: string) => void
}

export function reflectionDays(dates: string[], entries: MoodEntry[]): ReflectionDay[] {
  return dates.map((date) => {
    const dayEntries = entries.filter((entry) => entry.date === date)
    const points: MoodPoints = {}
    for (const entry of dayEntries) for (const mood of moodCatalog) {
      const count = entry.points[mood.id] ?? 0
      if (Number.isFinite(count) && count > 0) points[mood.id] = (points[mood.id] ?? 0) + count
    }
    return { date, entries: dayEntries, points, total: moodPointTotal(points) }
  })
}

export function emotionDistribution(days: ReflectionDay[]) {
  return moodCatalog.filter(mood => moodOptions.some(option => option.id === mood.id) || days.some(day => (day.points[mood.id] ?? 0) > 0)).map((mood) => ({
    ...mood,
    points: days.reduce((sum, day) => sum + (day.points[mood.id] ?? 0), 0),
  })).sort((a, b) => b.points - a.points)
}

export function bubbleDiameter(share: number): number { return Math.sqrt(Math.max(0, Math.min(1, share))) * 26 }
export function shortDate(date: string): string { return `${Number(date.slice(5, 7))}/${Number(date.slice(8))}` }
export function dayLabel(day: ReflectionDay): string {
  return `${day.date}：${day.total ? `${moodSummary(day.points)}；已记录 ${day.entries.length}/3 个时段，共 ${day.total} 点` : '未记录'}`
}
