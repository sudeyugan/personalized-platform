import type { FortuneKind } from '../../domain/fortune'
import { fortuneSigns } from './signs'
import { loveSigns } from './loveSigns'
import { futureSigns } from './futureSigns'
import type { ThemedFortuneSign } from './themedSigns'

export const fortuneThemes = [
  { kind: 'daily', name: '今日签', glyph: '日', note: '照见此刻', caption: '一日 · 与偶然相遇' },
  { kind: 'love', name: '恋爱签', glyph: '缘', note: '心意与相逢', caption: '一念 · 与心意相逢' },
  { kind: 'future', name: '前程签', glyph: '途', note: '行路与生长', caption: '一程 · 向远处生长' },
] as const

const dailySigns: ThemedFortuneSign[] = fortuneSigns.map((sign) => ({ ...sign, entries: [
  { label: '签意', text: sign.meaning }, { label: '今日一念', text: sign.advice },
] }))
const banks = { daily: dailySigns, love: loveSigns, future: futureSigns }
export function getFortuneSign(kind: FortuneKind, id: number) { return banks[kind].find((sign) => sign.id === id) }
export function getFortuneTheme(kind: FortuneKind) { return fortuneThemes.find((theme) => theme.kind === kind)! }
