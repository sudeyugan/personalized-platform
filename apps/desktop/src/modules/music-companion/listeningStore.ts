import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { parseLrc, type LyricLine } from './lyrics'
import { lyricCache } from './lyricCache'
import { cachedLyricStatus } from './lyricLookupStatus'
import { coverKey, trackKey, type MediaAction, type MediaSnapshot, type ListeningPreferences } from './types'

const defaults: ListeningPreferences = { enabled: false, controls: false, onlineLyrics: false, qqLyrics: false, lyricOffsetMs: 0 }
function preferences(): ListeningPreferences {
  try {
    const value = JSON.parse(localStorage.getItem('yiyu:listening-preferences') ?? '{}')
    return { enabled: value.enabled === true, controls: value.controls === true, onlineLyrics: value.onlineLyrics === true, qqLyrics: value.qqLyrics === true,
      lyricOffsetMs: Number.isFinite(value.lyricOffsetMs) ? Math.max(-10000, Math.min(10000, value.lyricOffsetMs)) : 0 }
  } catch { return defaults }
}
interface ListeningStore {
  preferences: ListeningPreferences; song: MediaSnapshot | null; lines: LyricLine[]; lyricKey: string
  lyricStatus: string; message: string; controlling: boolean; lyricOffsetMs: number; lyricRevision: number; lyricRetryRequested: number
  setPreferences: (changes: Partial<ListeningPreferences>) => void
  applySong: (song: MediaSnapshot | null) => void
  importLyrics: (source: string, expectedKey: string) => void
  restoreLyrics: () => void
  setLyricOffset: (offsetMs: number) => void
  retryLyrics: () => void
  forgetLyrics: () => void
  control: (action: MediaAction, expectedKey?: string) => Promise<void>
}
export const useListeningStore = create<ListeningStore>((set, get) => ({
  preferences: preferences(), song: null, lines: [], lyricKey: '', lyricStatus: '', message: '', controlling: false, lyricOffsetMs: 0, lyricRevision: 0, lyricRetryRequested: 0,
  setPreferences(changes) {
    const value = { ...get().preferences, ...changes }
    try { localStorage.setItem('yiyu:listening-preferences', JSON.stringify(value)) } catch { set({ message: '偏好未能保存，本次运行仍可使用' }) }
    const interrupted = get().lyricStatus.startsWith('正在匹配') || get().lyricStatus === '等待重新查找…'
    set({ preferences: value, lyricRevision: get().lyricRevision + 1, ...(interrupted ? { lyricStatus: get().lines.length ? '本地歌词库' : '尚未查找同步歌词' } : {}), ...(!value.enabled ? { song: null, lines: [], lyricKey: '', lyricStatus: '', lyricOffsetMs: 0 } : {}) })
    if (value.enabled && lyricCache.get(trackKey(get().song))) get().restoreLyrics()
  },
  applySong(song) {
    if (!get().preferences.enabled) return
    const changed = trackKey(song) !== trackKey(get().song)
    if (song?.coverUnchanged && coverKey(song) === coverKey(get().song)) song = { ...song, cover: get().song?.cover }
    set({ song, message: '', ...(changed ? { lines: [], lyricKey: '', lyricStatus: '', lyricOffsetMs: 0, lyricRevision: get().lyricRevision + 1 } : {}) })
    if (changed) get().restoreLyrics()
  },
  importLyrics(source, expectedKey) {
    if (!get().preferences.enabled || !expectedKey || expectedKey !== trackKey(get().song)) throw new Error('歌曲已切换，请重新选择歌词')
    const lines = parseLrc(source)
    if (!lines.length) throw new Error('未找到带时间戳的歌词，请使用UTF-8编码LRC')
    lyricCache.save(get().song!, source, 'manual')
    get().restoreLyrics()
    set({ lyricRevision: get().lyricRevision + 1 })
  },
  restoreLyrics() {
    const key = trackKey(get().song), entry = lyricCache.get(key)
    if (!get().preferences.enabled || !entry) return
    const lines = parseLrc(entry.lrc)
    set({ lines, lyricKey: key, lyricOffsetMs: entry.offsetMs,
      lyricStatus: lines.length ? `${entry.source === 'manual' ? '导入LRC' : entry.source === 'qqmusic' ? 'QQ音乐' : 'LRCLIB'} · 本地歌词库` : entry.instrumental ? '来源标记为纯音乐' : cachedLyricStatus(entry, get().preferences.onlineLyrics, get().preferences.qqLyrics === true) })
  },
  setLyricOffset(value) {
    if (!Number.isFinite(value)) return
    const offsetMs = Math.max(-10000, Math.min(10000, value))
    lyricCache.offset(trackKey(get().song), offsetMs)
    set({ lyricOffsetMs: offsetMs })
  },
  retryLyrics() {
    const state = get(), key = trackKey(state.song)
    if (!state.preferences.enabled || !state.preferences.onlineLyrics || !key) return
    if (lyricCache.get(key)?.source === 'manual') return
    if (!state.song?.artist.trim() || !Number.isFinite(state.song.durationMs) || state.song.durationMs <= 0) { set({ lyricStatus: '播放器尚未提供完整歌手与时长信息；可导入LRC' }); return }
    set({ lyricRetryRequested: state.lyricRetryRequested + 1, lyricRevision: state.lyricRevision + 1, lyricStatus: '等待重新查找…' })
  },
  forgetLyrics() {
    const song = get().song
    if (!song) return
    lyricCache.remove(trackKey(song))
    // A tombstone prevents an in-flight result or the next poll from restoring deleted lyrics.
    lyricCache.save(song, '', 'lrclib', { retryAfter: Date.now() + 6 * 60 * 60 * 1000, lookupScope: 'removed' })
    set({ lines: [], lyricKey: '', lyricStatus: '已移除，本曲自动查询暂停6小时', lyricOffsetMs: 0, lyricRevision: get().lyricRevision + 1 })
  },
  async control(action, expectedKey) {
    const { preferences: settings, song, controlling } = get()
    if (!settings.enabled || !settings.controls || !song || controlling || expectedKey && expectedKey !== trackKey(song)) return
    const allowed = action === 'play' ? song.canPlay : action === 'pause' ? song.canPause : action === 'previous' ? song.canPrevious : song.canNext
    if (!allowed) { set({ message: 'QQ音乐当前不支持此操作' }); return }
    set({ controlling: true, message: '' })
    try { await invoke('music_companion_control', { action, expectedTitle: song.title, expectedArtist: song.artist }) }
    catch { if (get().preferences.enabled) set({ message: '操作未完成，或歌曲已切换；请重试' }) }
    finally { set({ controlling: false }) }
  },
}))
