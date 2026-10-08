import { create } from 'zustand'
const KEY = 'yiyu:lyrics-display'
export interface LyricsPreferences { enabled: boolean; pinned: boolean; through: boolean; fontSize: number; opacity: number; position?: { x: number; y: number } }
const defaults: LyricsPreferences = { enabled: true, pinned: false, through: false, fontSize: 16, opacity: 92 }
export function normalizeLyricsPreferences(value: Partial<LyricsPreferences> | null): LyricsPreferences {
  const finite = (value: unknown, fallback: number, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : fallback
  return { enabled: value?.enabled !== false, pinned: value?.pinned === true, through: value?.through === true,
    fontSize: finite(value?.fontSize, 16, 12, 28), opacity: finite(value?.opacity, 92, 35, 100),
    position: value?.position && Number.isFinite(value.position.x) && Number.isFinite(value.position.y) && Math.abs(value.position.x) < 100000 && Math.abs(value.position.y) < 100000 ? value.position : undefined }
}
function load() { try { return normalizeLyricsPreferences(JSON.parse(localStorage.getItem(KEY) ?? '{}')) } catch { return defaults } }
export const useLyricsPreferences = create<{ value: LyricsPreferences; error: string; set: (value: Partial<LyricsPreferences>) => void }>((set, get) => ({
  value: load(), error: '', set: (changes) => {
    const value = normalizeLyricsPreferences({ ...get().value, ...changes })
    let error = ''
    try { localStorage.setItem(KEY, JSON.stringify(value)) } catch { error = '歌词显示偏好未能保存，本次运行仍可使用' }
    set({ value, error })
  },
}))
