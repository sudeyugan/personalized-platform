import { describe, expect, it } from 'vitest'
import type { MoodEntry } from '../../../domain/models'
import { bubbleDiameter, emotionDistribution, reflectionDays } from './reflectionData'

const dates = ['2026-10-01', '2026-10-02', '2026-10-03']
const entries: MoodEntry[] = [
  { id: 'a', date: dates[0], period: 'morning', points: { happy: 3, calm: 2 }, note: '真实备注', createdAt: '', updatedAt: '' },
  { id: 'b', date: dates[2], period: 'morning', points: { sad: 5 }, createdAt: '', updatedAt: '' },
  { id: 'c', date: dates[2], period: 'evening', points: { calm: 4, sad: 1 }, createdAt: '', updatedAt: '' },
  { id: 'outside', date: '2026-09-01', period: 'morning', points: { anxious: 5 }, createdAt: '', updatedAt: '' },
]

describe('emotion reflection chart data', () => {
  it('retains actual recorded points without inflating partially recorded days', () => {
    const days = reflectionDays(dates, entries)
    expect(days[0].total).toBe(5)
    expect(days[0].points.happy).toBe(3)
    expect(days[2].total).toBe(10)
    expect(days[2].points.sad).toBe(6)
  })
  it('keeps missing observations distinct from a recorded zero', () => {
    const days = reflectionDays(dates, entries)
    expect(days[0].points.sad ?? 0).toBe(0)
    expect(days[0].total).toBe(5)
    expect(days[1].total).toBe(0)
    expect(days[1].entries).toEqual([])
  })
  it('does not mutate entries or lose mixed emotions and notes', () => {
    const before = JSON.stringify(entries)
    const days = reflectionDays(dates, entries)
    expect(days[0].points).toEqual({ happy: 3, calm: 2 })
    expect(days[0].entries[0].note).toBe('真实备注')
    expect(JSON.stringify(entries)).toBe(before)
  })
  it('scales bubble area, not diameter, proportionally to the share', () => {
    expect(bubbleDiameter(.25)).toBe(bubbleDiameter(1) / 2)
    expect(bubbleDiameter(0)).toBe(0)
    expect(bubbleDiameter(-1)).toBe(0)
    expect(bubbleDiameter(2)).toBe(26)
  })
  it('includes all eighteen emotions and exactly the recorded total in composition', () => {
    const result = emotionDistribution(reflectionDays(dates, entries))
    expect(result).toHaveLength(18)
    expect(result.find((mood) => mood.id === 'anxious')?.points).toBe(0)
    expect(result.reduce((sum, mood) => sum + mood.points, 0)).toBe(15)
  })
  it('has no fictitious points when empty', () => {
    expect(emotionDistribution(reflectionDays(dates, [])).every((mood) => mood.points === 0)).toBe(true)
  })
  it('adds every point instead of counting a mixed emotion only once per slot', () => {
    const mixed: MoodEntry[] = [entries[0], { ...entries[0], id: 'evening', period: 'evening', points: { happy: 4, lonely: 1 } }]
    const result = emotionDistribution(reflectionDays(dates, mixed))
    expect(result[0].id).toBe('happy')
    expect(result[0].points).toBe(7)
    expect(result.find((mood) => mood.id === 'lonely')?.points).toBe(1)
    expect(result.reduce((sum, mood) => sum + mood.points, 0)).toBe(10)
  })
})
