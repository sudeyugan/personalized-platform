import { formatLocalDate } from './localDate'

export interface FortuneDraw { date: string; signId: number }
export const FORTUNE_COUNT = 48

export function normalizeFortune(value: unknown): FortuneDraw | undefined {
  if (!value || typeof value !== 'object') return
  const { date, signId } = value as Partial<FortuneDraw>
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return
  const parsed = new Date(date + 'T12:00:00')
  if (!Number.isFinite(parsed.getTime()) || formatLocalDate(parsed) !== date) return
  if (!Number.isInteger(signId) || signId! < 1 || signId! > FORTUNE_COUNT) return
  return { date, signId: signId! }
}

export function chooseFortune(previous: FortuneDraw | undefined, date = formatLocalDate(), random = Math.random): FortuneDraw {
  if (previous?.date === date && normalizeFortune(previous)) return previous
  return { date, signId: Math.min(FORTUNE_COUNT, Math.max(1, Math.floor(random() * FORTUNE_COUNT) + 1)) }
}
