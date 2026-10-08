import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi'
import { availableMonitors, getAllWindows, type Window as TauriWindow } from '@tauri-apps/api/window'
import { useEffect, useRef } from 'react'
import type { CompanionDesktopSnapshot } from '../../companion/companionDesktop'
import { useListeningStore } from '../listeningStore'
import { trackKey, validAction } from '../types'
import { lyricExcerptAt } from '../lyrics'
import { lyricsPlacement } from './layout'
import { useLyricsPreferences } from './preferences'
import type { LyricsPacket, LyricsRequest, LyricsTick } from './types'

// Main-window-only host: it owns data, controls, preferences and native layout.
// The child receives current-song packets, never stores/library/security state.
export function useLyricsWindowBridge(snapshot: CompanionDesktopSnapshot) {
  const latest = useRef(snapshot); latest.current = snapshot
  const refresh = useRef<() => void>(() => undefined)
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return
    let disposed = false, reader = false, lastTrack = '', lastLines: unknown, lastLayout = '', lastTick = ''
    let portrait: TauriWindow | undefined, lyrics: TauriWindow | undefined
    let movedTimer: number | undefined, pinnedTimer: number | undefined
    let chain: Promise<unknown> = Promise.resolve()
    const stops: (() => void)[] = []
    const publish = (packet: LyricsPacket) => invoke('companion_lyrics_publish', { packet })
    const update = () => {
      if (disposed) return
      chain = chain.catch(() => undefined).then(async () => {
        if (disposed || !lyrics || !portrait) return
        const state = useListeningStore.getState(), preferences = useLyricsPreferences.getState().value, role = latest.current
        const song = state.song, key = trackKey(song)
        const busy = Boolean(role.agentStatus) || role.action === 'listening' || role.action === 'speaking'
        const currentLine = lyricExcerptAt(state.lines, (song?.positionMs ?? 0) + state.lyricOffsetMs).current
        const visible = state.preferences.enabled && preferences.enabled && !!song && (reader || !!currentLine) && (preferences.pinned || role.desktopVisible) && (preferences.pinned || reader || !busy)
        if (!visible || !song || !key) {
          await lyrics.hide()
          if (!song || !state.preferences.enabled) { await publish({ kind: 'clear' }); lastTrack = ''; lastLines = undefined; lastTick = '' }
          lastLayout = ''; return
        }
        if (key !== lastTrack || state.lines !== lastLines) {
          await publish({ kind: 'track', track: { key, title: song.title.slice(0, 500), artist: song.artist.slice(0, 500), lines: state.lines } })
          lastTrack = key; lastLines = state.lines
        }
        const tick: LyricsTick = { key, position: song.positionMs + state.lyricOffsetMs, offsetMs: state.lyricOffsetMs, playing: song.playing, status: state.lyricStatus.slice(0, 250),
          reader, pinned: preferences.pinned, through: preferences.pinned && preferences.through, fontSize: preferences.fontSize, opacity: preferences.opacity,
          pixel: role.pixelPetEnabled, busy, controls: state.preferences.controls, canPlay: song.canPlay, canPause: song.canPause, canPrevious: song.canPrevious, canNext: song.canNext }
        const tickKey = JSON.stringify(tick)
        if (tickKey !== lastTick) { await publish({ kind: 'tick', tick }); lastTick = tickKey }
        await lyrics.setIgnoreCursorEvents(tick.through || !preferences.pinned && role.desktopMode === 'quiet')
        await lyrics.setAlwaysOnTop(preferences.pinned || role.desktopMode !== 'normal')
        const [position, size, monitors] = await Promise.all([portrait.outerPosition(), portrait.outerSize(), availableMonitors()])
        if (disposed) return
        const anchor = preferences.pinned && preferences.position ? preferences.position : { x: position.x + size.width / 2, y: position.y + size.height / 2 }
        const monitor = [...monitors].sort((a, b) => {
          const distance = (item: typeof a) => Math.hypot(Math.max(item.workArea.position.x - anchor.x, 0, anchor.x - item.workArea.position.x - item.workArea.size.width), Math.max(item.workArea.position.y - anchor.y, 0, anchor.y - item.workArea.position.y - item.workArea.size.height))
          return distance(a) - distance(b)
        })[0]
        if (!monitor) return
        const area = monitor.workArea
        const rect = lyricsPlacement({ ...position, ...size }, { ...area.position, ...area.size }, monitor.scaleFactor, reader, role.pixelPetEnabled, preferences.pinned ? preferences.position : undefined, preferences.fontSize)
        const layoutKey = JSON.stringify(rect)
        if (layoutKey !== lastLayout) { await lyrics.setSize(new PhysicalSize(rect.width, rect.height)); await lyrics.setPosition(new PhysicalPosition(rect.x, rect.y)); lastLayout = layoutKey }
        if (!disposed) await lyrics.show()
      }).catch((error) => { if (!disposed) console.warn('Lyrics window:', error) })
    }
    const request = (value: LyricsRequest) => {
      const state = useListeningStore.getState(), prefs = useLyricsPreferences.getState()
      if (!state.preferences.enabled || !state.song || value.key !== trackKey(state.song)) return
      switch (value.kind) {
        case 'view': reader = value.reader === true; prefs.set({ enabled: true }); break
        case 'pin': prefs.set({ pinned: value.pinned === true, through: false }); break
        case 'through': prefs.set({ through: value.enabled === true }); break
        case 'close': reader = false; prefs.set({ enabled: false }); break
        case 'font': if (Math.abs(value.delta) === 1) prefs.set({ fontSize: prefs.value.fontSize + value.delta }); break
        case 'opacity': if (Math.abs(value.delta) === 5) prefs.set({ opacity: prefs.value.opacity + value.delta }); break
        case 'offset': if ([-100, 0, 100].includes(value.deltaMs)) state.setLyricOffset(value.deltaMs ? state.lyricOffsetMs + value.deltaMs : 0); break
        case 'control': if (validAction(value.action)) void state.control(value.action, value.key); break
      }
      update()
    }
    refresh.current = update
    void (async () => {
      const windows = await getAllWindows(); if (disposed) return
      portrait = windows.find((item) => item.label === 'companion'); lyrics = windows.find((item) => item.label === 'companion-lyrics')
      for (const [event, handler] of [['companion:lyrics-request', request], ['companion:lyrics-open', (value: { key: string }) => request({ kind: 'view', key: value.key, reader: true })]] as const) {
        const stop = await listen(event, ({ payload }) => { if (!disposed) handler(payload as LyricsRequest & { key: string }) }); if (disposed) stop(); else stops.push(stop)
      }
      if (portrait) { const stop = await portrait.onMoved(() => { window.clearTimeout(movedTimer); movedTimer = window.setTimeout(update, 120) }); if (disposed) stop(); else stops.push(stop) }
      if (lyrics) { const stop = await lyrics.onMoved(() => {
        window.clearTimeout(pinnedTimer)
        pinnedTimer = window.setTimeout(() => { void (async () => {
          if (disposed || !lyrics || !useLyricsPreferences.getState().value.pinned) return
          const position = await lyrics.outerPosition(), old = useLyricsPreferences.getState().value.position
          if (!disposed && (!old || old.x !== position.x || old.y !== position.y)) useLyricsPreferences.getState().set({ position: { x: position.x, y: position.y } })
        })().catch(() => undefined) }, 180)
      }); if (disposed) stop(); else stops.push(stop) }
      if (disposed) return
      stops.push(useListeningStore.subscribe(update), useLyricsPreferences.subscribe(update)); update()
    })().catch((error) => { if (!disposed) console.warn('Lyrics setup:', error) })
    return () => {
      disposed = true; refresh.current = () => undefined; stops.forEach((stop) => stop()); window.clearTimeout(movedTimer); window.clearTimeout(pinnedTimer)
      void chain.catch(() => undefined).then(async () => { await lyrics?.hide(); await publish({ kind: 'clear' }) }).catch(() => undefined)
    }
  }, [])
  useEffect(() => { refresh.current() }, [snapshot])
}
