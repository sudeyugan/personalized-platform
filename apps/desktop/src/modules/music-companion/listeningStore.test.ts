import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useListeningStore } from './listeningStore'
import { useLibraryStore } from '../../state/useLibraryStore'
import { trackKey, type MediaSnapshot } from './types'

const native = vi.hoisted(() => ({ invoke: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: native.invoke }))
const song: MediaSnapshot = { title: '歌曲', artist: '歌手', album: '专辑', playing: true, positionMs: 1000, durationMs: 180000, canPlay: false, canPause: true, canNext: true, canPrevious: false }
describe('ephemeral listening session', () => {
  beforeEach(() => { useLibraryStore.setState(state => ({ data: { ...state.data, lyricLibrary: { version: 1, entries: [] } } })); native.invoke.mockClear(); useListeningStore.setState({ preferences: { enabled: true, controls: false, onlineLyrics: false, lyricOffsetMs: 0 }, song: null, lines: [], lyricKey: '', controlling: false, message: '', lyricOffsetMs: 0, lyricRevision: 0 }) })
  it('retains local lyrics on progress updates but clears them when the recording changes', () => {
    const store = useListeningStore.getState()
    store.applySong(song); store.importLyrics('[00:01]你好', trackKey(song))
    store.applySong({ ...song, positionMs: 1500 })
    expect(useListeningStore.getState().lines).toHaveLength(1)
    store.applySong({ ...song, title: '另一首' })
    expect(useListeningStore.getState().lines).toEqual([])
  })
  it('reuses artwork instead of transferring the same cover every second', () => {
    const store = useListeningStore.getState()
    store.applySong({ ...song, cover: 'data:image/png;base64,test' })
    store.applySong({ ...song, cover: null, coverUnchanged: true, positionMs: 2000 })
    expect(useListeningStore.getState().song?.cover).toBe('data:image/png;base64,test')
    store.applySong({ ...song, title: '不同作品', cover: null, coverUnchanged: false })
    expect(useListeningStore.getState().song?.cover).toBeNull()
  })
  it('disable clears data and refuses late results and stale lyric imports', () => {
    const store = useListeningStore.getState(); store.applySong(song); store.setPreferences({ enabled: false }); store.applySong(song)
    expect(useListeningStore.getState().song).toBeNull()
    expect(() => store.importLyrics('[00:01]你好', trackKey(song))).toThrow()
  })
  it('controls require opt-in, capability and the current displayed song', async () => {
    const store = useListeningStore.getState(); store.applySong(song)
    await store.control('pause'); expect(native.invoke).not.toHaveBeenCalled()
    store.setPreferences({ controls: true })
    await store.control('previous'); await store.control('pause', 'stale')
    expect(native.invoke).not.toHaveBeenCalled()
    await store.control('pause', trackKey(song))
    expect(native.invoke).toHaveBeenCalledWith('music_companion_control', { action: 'pause', expectedTitle: song.title, expectedArtist: song.artist })
  })
})
