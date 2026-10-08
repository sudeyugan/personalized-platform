import { describe, expect, it } from 'vitest'
import { cachedLyricStatus, reasonForLyricError } from './lyricLookupStatus'
import type { SavedLyrics } from '../../domain/lyricLibrary'
const entry: SavedLyrics = { key: '', title: 'Song', artist: '', album: '', durationMs: 1000, lrc: '', source: 'lrclib', offsetMs: 0, updatedAt: 0 }
describe('actionable cached lyric status', () => {
  it('preserves the failure type without recording raw request URLs', () => {
    expect(reasonForLyricError('LYRICS_TIMEOUT')).toBe('timeout')
    expect(reasonForLyricError('LYRICS_RATE_LIMITED:60')).toBe('rate-limit')
    expect(reasonForLyricError('LYRICS_INVALID_RESPONSE')).toBe('invalid-response')
    expect(cachedLyricStatus({ ...entry, failureReason: 'timeout' }, true, true)).toContain('超时')
    expect(cachedLyricStatus({ ...entry, failureReason: 'network' }, true, true)).toContain('连接失败')
    expect(cachedLyricStatus(entry, true, false)).toContain('目前仅查询LRCLIB')
  })
  it('distinguishes a disabled query and an explicit removal from missing lyrics', () => {
    expect(cachedLyricStatus(entry, false, false)).toContain('自动收集已关闭')
    expect(cachedLyricStatus({ ...entry, lookupScope: 'removed' }, true, true)).toContain('自动查询暂停6小时')
    expect(cachedLyricStatus({ ...entry, failureReason: 'private' }, true, true)).toContain('未发送')
  })
})
