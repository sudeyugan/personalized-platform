import type { CSSProperties } from 'react'
import type { MoodKind, MoodPoints } from '../../domain/models'
import { moodByKind, moodOptions } from './moodConfig'

export const moodPointTotal = (points: MoodPoints) => Object.values(points).reduce((sum, count) => sum + (count ?? 0), 0)

export const expandMoodPoints = (points: MoodPoints): MoodKind[] => moodOptions.flatMap((option) => Array.from({ length: points[option.id] ?? 0 }, () => option.id))

export const collapseMoodPoints = (allocation: MoodKind[]): MoodPoints => allocation.reduce<MoodPoints>((points, kind) => {
  points[kind] = (points[kind] ?? 0) + 1
  return points
}, {})

export const moodSummary = (points: MoodPoints) => moodOptions
  .map((option) => ({ ...option, count: points[option.id] ?? 0 }))
  .filter((option) => option.count > 0)
  .sort((a, b) => b.count - a.count)
  .map((option) => `${option.label} ${option.count}`)
  .join(' · ')

export function moodGradientStyle(points: MoodPoints): CSSProperties {
  const values = moodOptions
    .map((option) => ({ color: option.color, count: points[option.id] ?? 0 }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
  const total = values.reduce((sum, item) => sum + item.count, 0)
  if (!total) return { background: 'var(--surface-soft)' }
  if (values.length === 1) return { background: values[0].color }
  const stops: string[] = [`${values[0].color} 0%`]
  let cursor = 0
  values.forEach((item, index) => {
    cursor += (item.count / total) * 100
    const next = values[index + 1]
    if (!next) {
      stops.push(`${item.color} 100%`)
      return
    }
    const softness = Math.min(4, (item.count / total) * 18, (next.count / total) * 18)
    stops.push(`${item.color} ${Math.max(0, cursor - softness).toFixed(1)}%`)
    stops.push(`${next.color} ${Math.min(100, cursor + softness).toFixed(1)}%`)
  })
  return { background: `linear-gradient(90deg, ${stops.join(', ')})` }
}

export const moodColor = (kind: MoodKind) => moodByKind[kind].color
