import { invoke } from '@tauri-apps/api/core'
import { PrivacySession } from '../privacy/privacySession'
import { useLibraryStore } from '../../state/useLibraryStore'
import { lyricCache } from './lyricCache'
import { useListeningStore } from './listeningStore'
import { lyricFailure, lyricOutcome, reasonForLyricError } from './lyricLookupStatus'
import { lyricLookupVersion, type LyricFailureReason } from '../../domain/lyricLibrary'
import { parseLrc } from './lyrics'
import { trackKey } from './types'

interface LyricsResult { lrc: string; instrumental: boolean; outcome?: string; source?: 'lrclib' | 'qqmusic' }
// The existing one-second media poll drives this collector: no second permanent poller.
export function createLyricCollector(lookup = (args: Record<string, unknown>) => invoke<LyricsResult>('lyrics_lookup', args), now = Date.now) {
  let key = '', stableSince = 0, playing = false, active = false, nextRequest = 0, disposed = false
  let retryVersion = useListeningStore.getState().lyricRetryRequested, forcedKey = ''
  const tick = async () => {
    if (disposed) return
    const state = useListeningStore.getState(), song = state.song, current = trackKey(song)
    if (retryVersion !== state.lyricRetryRequested) { retryVersion = state.lyricRetryRequested; forcedKey = current }
    if (forcedKey && forcedKey !== current) forcedKey = ''
    const forced = forcedKey === current && Boolean(current)
    if (key !== current || playing !== Boolean(song?.playing)) { key = current; playing = Boolean(song?.playing); stableSince = now() }
    if (!state.preferences.enabled || !state.preferences.onlineLyrics || !song || !song.artist.trim() || song.durationMs <= 0 || active || (!forced && now() - stableSince < 3000) || now() < nextRequest) return
    const entry = lyricCache.get(current)
    const lookupScope = state.preferences.qqLyrics ? 'qqmusic+lrclib' : 'lrclib'
    const sameScope = entry?.lookupScope === 'removed' || (entry?.lookupScope ?? 'lrclib') === lookupScope
    const currentPipeline = entry?.lookupScope === 'removed' || entry?.lookupVersion === lyricLookupVersion
    if (entry?.source === 'manual' || (!forced && (entry?.lrc || entry?.instrumental || sameScope && currentPipeline && (entry?.retryAfter ?? 0) > now()))) return
    forcedKey = ''
    const revision = state.lyricRevision
    active = true; nextRequest = now() + 15000
    const live = () => {
      const latest = useListeningStore.getState()
      return !disposed && latest.preferences.enabled && latest.preferences.onlineLyrics && latest.lyricRevision === revision && trackKey(latest.song) === current && lyricCache.get(current)?.source !== 'manual'
    }
    try {
      const fields = { title: song.title, artist: song.artist, album: song.album, durationMs: song.durationMs }
      const privacy = new PrivacySession(useLibraryStore.getState().data.settings.trust.privateDictionary)
      // Automatic metadata requests never silently bypass private-dictionary findings.
      if ([song.title, song.artist, song.album].some(text => privacy.sanitize(text).findings.length > 0)) {
        if (live()) { if (!entry?.lrc && !entry?.instrumental) lyricCache.save(song, '', 'lrclib', { retryAfter: now() + 6 * 60 * 60 * 1000, lookupScope, lookupVersion: lyricLookupVersion, failureReason: 'private' }); useListeningStore.setState({ lyricStatus: '歌曲信息含私密词，未发送；可导入LRC' }) }
        return
      }
      if (live()) useListeningStore.setState({ lyricStatus: '正在匹配同步歌词…' })
      const result = await lookup(fields)
      if (!live()) return
      if (result.lrc.length > 200_000 || result.source === 'qqmusic' && !state.preferences.qqLyrics) throw new Error('LYRICS_INVALID_RESPONSE')
      const lrc = parseLrc(result.lrc).length ? result.lrc : ''
      if (!lrc && !result.instrumental && (entry?.lrc || entry?.instrumental)) { useListeningStore.setState({ lyricStatus: lyricOutcome(result.outcome) + '；保留已有歌词' }); return }
      const failureReason: LyricFailureReason | undefined = lrc || result.instrumental ? undefined : result.outcome === 'ambiguous' || result.outcome === 'unsynced' ? result.outcome : 'not-found'
      lyricCache.save(song, lrc, result.source === 'qqmusic' ? 'qqmusic' : 'lrclib', { instrumental: result.instrumental, retryAfter: lrc ? undefined : now() + 6 * 60 * 60 * 1000, lookupScope, lookupVersion: lyricLookupVersion, failureReason })
      useListeningStore.getState().restoreLyrics()
    } catch (error) {
      if (String(error).includes('LYRICS_BUSY') || String(error).includes('LYRICS_DISABLED')) {
        // A revoked native request may still be releasing its lease; don't cache that as a song failure.
        if (live()) { forcedKey = current; useListeningStore.setState({ lyricStatus: '等待重新查找…' }) }
        return
      }
      const failure = lyricFailure(error)
      if (live()) {
        try { if (!entry?.lrc && !entry?.instrumental) lyricCache.save(song, '', 'lrclib', { retryAfter: now() + failure.delay, lookupScope, lookupVersion: lyricLookupVersion, failureReason: reasonForLyricError(error) }) } catch { /* Keep current state and do not flood a full/unavailable cache. */ }
        useListeningStore.setState({ lyricStatus: failure.message })
      }
      // Only a source-wide rate limit blocks other songs; ordinary failures cool down per track.
      if (failure.rateLimited) nextRequest = now() + failure.delay
    } finally { active = false }
  }
  return { tick, dispose: () => { disposed = true } }
}
