import { formatLocalDate } from './localDate'

export type FortuneKind = 'daily' | 'love' | 'future'
export interface FortuneDraw { date: string; signId: number }
export interface FortuneData { today?: FortuneDraw; love?: FortuneDraw; future?: FortuneDraw }
export const FORTUNE_COUNT = 48
export const FORTUNE_COUNTS: Record<FortuneKind, number> = { daily: FORTUNE_COUNT, love: 24, future: 24 }
export const FORTUNE_KEYS = { daily: 'today', love: 'love', future: 'future' } as const

export function normalizeFortune(value: unknown, kind: FortuneKind = 'daily'): FortuneDraw | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return
  const { date, signId } = value as Partial<FortuneDraw>
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return
  const parsed = new Date(date + 'T12:00:00')
  if (!Number.isFinite(parsed.getTime()) || formatLocalDate(parsed) !== date) return
  if (!Number.isInteger(signId) || signId! < 1 || signId! > FORTUNE_COUNTS[kind]) return
  return { date, signId: signId! }
}

export function normalizeFortunes(value: unknown): FortuneData {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as FortuneData : {}
  const result: FortuneData = {}
  for (const kind of Object.keys(FORTUNE_KEYS) as FortuneKind[]) {
    const key = FORTUNE_KEYS[kind], draw = normalizeFortune(source[key], kind)
    if (draw) result[key] = draw
  }
  return result
}

export function chooseFortune(previous: FortuneDraw | undefined, date = formatLocalDate(), random = Math.random, kind: FortuneKind = 'daily'): FortuneDraw {
  if (previous?.date === date && normalizeFortune(previous, kind)) return previous
  const sample = random(), count = FORTUNE_COUNTS[kind]
  return { date, signId: Math.min(count, Math.max(1, Math.floor((Number.isFinite(sample) ? sample : 0) * count) + 1)) }
}
