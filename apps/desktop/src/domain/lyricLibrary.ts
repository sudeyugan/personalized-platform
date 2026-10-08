export const lyricLookupVersion = 2
export const lyricFailureReasons = ['not-found', 'unsynced', 'ambiguous', 'timeout', 'network', 'invalid-response', 'rate-limit', 'private'] as const
export type LyricFailureReason = typeof lyricFailureReasons[number]
export interface SavedLyrics {
  key: string; title: string; artist: string; album: string; durationMs: number
  lrc: string; source: 'manual' | 'lrclib' | 'qqmusic'; offsetMs: number; updatedAt: number
  retryAfter?: number; instrumental?: boolean
  lookupScope?: 'lrclib' | 'qqmusic+lrclib' | 'removed'
  lookupVersion?: number; failureReason?: LyricFailureReason
}
export interface LyricLibrary { version: 1; entries: SavedLyrics[] }
export const lyricLimits = { entries: 200, text: 200_000, total: 8_000_000 }
export function normalizeLyricLibrary(value: unknown): LyricLibrary {
  const result: SavedLyrics[] = [], seen = new Set<string>()
  let size = 0
  if (!value || typeof value !== 'object' || !('entries' in value) || !Array.isArray(value.entries)) return { version: 1, entries: result }
  for (const item of value.entries.slice(0, lyricLimits.entries)) {
    if (!item || typeof item !== 'object' || !['manual', 'lrclib', 'qqmusic'].includes(item.source)) continue
    if (![item.title, item.artist, item.album, item.lrc].every(text => typeof text === 'string') || item.title.length > 256 || item.artist.length > 256 || item.album.length > 256 || !item.title.trim()) continue
    if (!Number.isFinite(item.durationMs) || item.durationMs < 0 || item.durationMs > 86_400_000 || item.lrc.length > lyricLimits.text) continue
    const key = JSON.stringify([item.title, item.artist, item.album, Math.round(item.durationMs / 1000)])
    if (item.key !== key || seen.has(key) || size + item.lrc.length > lyricLimits.total) continue
    seen.add(key); size += item.lrc.length
    result.push({ key, title: item.title, artist: item.artist, album: item.album, durationMs: item.durationMs,
      lrc: item.lrc, source: item.source, offsetMs: Number.isFinite(item.offsetMs) ? Math.max(-10000, Math.min(10000, item.offsetMs)) : 0,
      updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : 0,
      retryAfter: Number.isFinite(item.retryAfter) ? item.retryAfter : undefined, instrumental: item.instrumental === true,
      lookupScope: ['lrclib', 'qqmusic+lrclib', 'removed'].includes(item.lookupScope) ? item.lookupScope : undefined,
      lookupVersion: item.lookupVersion === lyricLookupVersion ? lyricLookupVersion : undefined,
      failureReason: lyricFailureReasons.includes(item.failureReason) ? item.failureReason : undefined })
  }
  return { version: 1, entries: result }
}
export function putSavedLyrics(library: LyricLibrary, entry: SavedLyrics): LyricLibrary {
  const previous = library.entries.find(item => item.key === entry.key)
  if (previous?.source === 'manual' && entry.source !== 'manual') return library
  const entries = library.entries.filter(item => item.key !== entry.key)
  entries.push(entry)
  const total = () => entries.reduce((size, item) => size + item.lrc.length, 0)
  while (entries.length > lyricLimits.entries || total() > lyricLimits.total) {
    const evictable = entries.filter(item => item.source !== 'manual' && item.key !== entry.key).sort((a, b) => a.updatedAt - b.updatedAt)[0]
    if (!evictable) throw new Error('歌词库已满，请先删除不需要的歌词；导入的LRC不会自动丢弃')
    entries.splice(entries.indexOf(evictable), 1)
  }
  return { version: 1, entries }
}
