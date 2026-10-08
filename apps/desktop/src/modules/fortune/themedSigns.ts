import type { FortuneSign } from './signs'

export interface FortuneEntry { label: string; text: string }
export interface ThemedFortuneSign extends FortuneSign { entries: readonly FortuneEntry[] }
export type ThemedSignRow = readonly [string, string, string, string, string, string, string]

export function createThemedSigns(rows: readonly ThemedSignRow[], labels: readonly [string, string, string]): ThemedFortuneSign[] {
  return rows.map(([grade, title, poem, meaning, first, second, third], index) => ({
    id: index + 1, grade, title, poem, meaning, advice: third,
    entries: [first, second, third].map((text, entry) => ({ label: labels[entry], text })),
  }))
}
