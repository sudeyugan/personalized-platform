import { useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { emitTo, listen } from '@tauri-apps/api/event'
import { useListeningStore } from './listeningStore'
import { lyricExcerptAt } from './lyrics'
import { createLyricCollector } from './lyricCollector'
import { coverKey, trackKey, validAction, type MediaSnapshot } from './types'

let configuration = Promise.resolve()
let lyricsConfiguration = Promise.resolve()
function configureLyrics(enabled: boolean, qqMusic = false) {
  lyricsConfiguration = lyricsConfiguration.catch(() => undefined).then(() => invoke<void>('lyrics_lookup_enable', { enabled, qqMusic }))
  return lyricsConfiguration
}
function configure(enabled: boolean, controls = false) {
  configuration = configuration.catch(() => undefined).then(() => invoke<void>('music_companion_enable', { enabled, controls }))
  return configuration
}
export function ListeningRuntime() {
  const enabled = useListeningStore(store => store.preferences.enabled)
  const controls = useListeningStore(store => store.preferences.controls)
  const online = useListeningStore(store => store.preferences.onlineLyrics)
  const qqMusic = useListeningStore(store => store.preferences.qqLyrics === true)
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return
    const collector = createLyricCollector()
    let stopped = false, unsubscribe: (() => void) | undefined
    void configureLyrics(enabled && online, qqMusic).then(() => {
      if (stopped) return
      unsubscribe = useListeningStore.subscribe(() => { void collector.tick() })
      useListeningStore.getState().restoreLyrics()
      void collector.tick()
    }).catch(() => { if (!stopped && enabled && online) useListeningStore.setState({ lyricStatus: '联网歌词暂未启用' }) })
    return () => { stopped = true; collector.dispose(); unsubscribe?.(); void configureLyrics(false).catch(() => undefined) }
  }, [enabled, online, qqMusic])
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return
    if (!enabled) { void configure(false).catch(() => undefined); return }
    let disposed = false, timer: number | undefined
    const poll = async () => {
      try {
        const song = await invoke<MediaSnapshot | null>('music_companion_snapshot', { knownCoverKey: coverKey(useListeningStore.getState().song) || null })
        if (!disposed) useListeningStore.getState().applySong(song)
      } catch {
        if (!disposed) useListeningStore.setState({ song: null, lines: [], lyricKey: '', message: '暂未读到QQ音乐，请确认它已开始播放' })
      }
      if (!disposed) timer = window.setTimeout(() => void poll(), 1000)
    }
    const startup = window.setTimeout(() => {
      void configure(true, controls).then(() => { if (!disposed) void poll() }).catch(() => {
        if (!disposed) useListeningStore.setState({ message: '系统伴听暂不可用' })
      })
    }, 0)
    const stopOnExit = () => { void configure(false).catch(() => undefined) }
    window.addEventListener('beforeunload', stopOnExit)
    return () => { disposed = true; window.clearTimeout(startup); window.clearTimeout(timer); window.removeEventListener('beforeunload', stopOnExit); void configure(false).catch(() => undefined) }
  }, [enabled, controls])
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return
    let disposed = false, previousCover: string | null | undefined, previousKey = ''
    const publish = () => {
      const state = useListeningStore.getState(), song = state.song
      const cover = song?.cover, key = trackKey(song)
      const excerpt = lyricExcerptAt(state.lines, (song?.positionMs ?? 0) + state.lyricOffsetMs)
      const payload = { enabled: state.preferences.enabled, controls: state.preferences.controls, key,
        song: song ? { ...song, cover: cover === previousCover && key === previousKey ? undefined : cover } : null,
        lyric: excerpt.current, excerpt: state.lines.length ? excerpt : undefined }
      previousCover = cover
      previousKey = key
      void emitTo('companion', 'companion:listening', payload).catch(() => undefined)
    }
    const unsubscribe = useListeningStore.subscribe(publish)
    let stopReady: (() => void) | undefined, stopControls: (() => void) | undefined
    void listen('companion:ready', () => { previousCover = undefined; publish() }).then(stop => { if (disposed) stop(); else stopReady = stop })
    void listen<{ action: unknown; key: string }>('companion:listening-control', ({ payload }) => {
      if (!disposed && validAction(payload.action)) void useListeningStore.getState().control(payload.action, payload.key)
    }).then(stop => { if (disposed) stop(); else stopControls = stop })
    publish()
    return () => { disposed = true; unsubscribe(); stopReady?.(); stopControls?.() }
  }, [])
  return null
}
