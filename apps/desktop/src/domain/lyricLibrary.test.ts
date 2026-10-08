import { describe, expect, it } from 'vitest'
import { normalizeLyricLibrary, putSavedLyrics, type SavedLyrics } from './lyricLibrary'
const entry = (id: string, source: SavedLyrics['source'] = 'lrclib'): SavedLyrics => ({ key: JSON.stringify([id, 'artist', 'album', 180]), title: id, artist: 'artist', album: 'album', durationMs: 180000, lrc: '[00:01]Line', source, offsetMs: 250, updatedAt: 1 })
describe('bounded portable lyrics', () => {
  it('only persists bounded failure reasons and the current lookup revision', () => {
    const old = entry('Old failure')
    const current = { ...entry('Current failure'), lrc: '', lookupVersion: 2, failureReason: 'timeout' }
    const restored = normalizeLyricLibrary({ entries: [old, current, { ...entry('Unsafe'), lookupVersion: 999, failureReason: 'raw secret or URL' }] })
    expect(restored.entries[0].lookupVersion).toBeUndefined()
    expect(restored.entries[1]).toMatchObject({ lookupVersion: 2, failureReason: 'timeout' })
    expect(restored.entries[2].failureReason).toBeUndefined()
    expect(restored.entries[2].lookupVersion).toBeUndefined()
  })
  it('round-trips QQ lyrics, calibration and bounded provider scopes without migrating old entries', () => {
    const qq = { ...entry('QQ live', 'qqmusic'), offsetMs: 420, lookupScope: 'qqmusic+lrclib' as const }
    const restored = normalizeLyricLibrary(JSON.parse(JSON.stringify({ version: 1, entries: [qq, entry('Old'), { ...entry('Forged'), source: 'unknown' }] })))
    expect(restored.entries).toHaveLength(2)
    expect(restored.entries[0]).toMatchObject(qq)
    expect(restored.entries[1].lookupScope).toBeUndefined()
    expect(putSavedLyrics({ version: 1, entries: [entry('QQ live', 'manual')] }, qq).entries[0].source).toBe('manual')
    expect(normalizeLyricLibrary({ entries: [{ ...qq, lookupScope: 'https://evil.test' }] }).entries[0].lookupScope).toBeUndefined()
  })
  it('normalizes an old or malformed library and discards inconsistent identities', () => {
    expect(normalizeLyricLibrary(undefined).entries).toEqual([])
    expect(normalizeLyricLibrary({ entries: [entry('ok'), { ...entry('bad'), key: 'forged' }, null, entry('ok')] }).entries).toHaveLength(1)
    expect(normalizeLyricLibrary({ entries: [{ ...entry('big'), lrc: 'x'.repeat(200001) }] }).entries).toEqual([])
  })
  it('preserves manual priority and evicts only automatic entries when full', () => {
    const library = { version: 1 as const, entries: Array.from({ length: 200 }, (_, id) => entry(String(id), id === 0 ? 'manual' : 'lrclib')) }
    const next = putSavedLyrics(library, entry('new'))
    expect(next.entries).toHaveLength(200); expect(next.entries.some(item => item.title === '0')).toBe(true)
    expect(putSavedLyrics(next, { ...entry('0'), lrc: '[00:01]Replacement' })).toBe(next)
    expect(() => putSavedLyrics({ version: 1, entries: library.entries.map(item => ({ ...item, source: 'manual' as const })) }, entry('new', 'manual'))).toThrow('不会自动丢弃')
  })
})
