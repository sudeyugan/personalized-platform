import { useLibraryStore } from '../../state/useLibraryStore'
import { commitLibraryData } from '../../state/persistence'
import { normalizeLyricLibrary, putSavedLyrics, type SavedLyrics } from '../../domain/lyricLibrary'
import { trackKey, type MediaSnapshot } from './types'

export const lyricCache = {
  entries: () => useLibraryStore.getState().data.lyricLibrary?.entries ?? [],
  get: (key: string) => lyricCache.entries().find(item => item.key === key),
  save(song: MediaSnapshot, lrc: string, source: SavedLyrics['source'], options: Partial<Pick<SavedLyrics, 'offsetMs' | 'retryAfter' | 'instrumental' | 'lookupScope' | 'lookupVersion' | 'failureReason'>> = {}) {
    const data = useLibraryStore.getState().data
    const previous = lyricCache.get(trackKey(song))
    const entry: SavedLyrics = { key: trackKey(song), title: song.title, artist: song.artist, album: song.album, durationMs: song.durationMs,
      lrc, source, offsetMs: previous?.offsetMs ?? 0, updatedAt: Date.now(), ...options }
    const library = putSavedLyrics(normalizeLyricLibrary(data.lyricLibrary), entry)
    commitLibraryData({ ...data, lyricLibrary: library }, useLibraryStore.setState)
  },
  offset(key: string, offsetMs: number) {
    const data = useLibraryStore.getState().data, entry = lyricCache.get(key)
    if (!entry) return
    const library = { version: 1 as const, entries: lyricCache.entries().map(item => item.key === key ? { ...item, offsetMs } : item) }
    commitLibraryData({ ...data, lyricLibrary: library }, useLibraryStore.setState)
  },
  remove(key: string) {
    const data = useLibraryStore.getState().data
    commitLibraryData({ ...data, lyricLibrary: { version: 1, entries: lyricCache.entries().filter(item => item.key !== key) } }, useLibraryStore.setState)
  },
}
