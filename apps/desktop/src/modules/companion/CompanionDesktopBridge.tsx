import { emitTo, listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { getAllWindows, getCurrentWindow } from '@tauri-apps/api/window'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useLibraryStore } from '../../state/useLibraryStore'
import { companionDesktopSnapshot } from './companionDesktop'
import { characterAssetIds } from './character/CharacterConfig'

const isTauri = () => '__TAURI_INTERNALS__' in window

export function CompanionDesktopBridge() {
  const { data, playback, setCompanionDesktop, setCompanionPersonality } = useLibraryStore()
  const learnedTrack = useRef<string | undefined>(undefined)
  const snapshot = useMemo(() => companionDesktopSnapshot(data.companion, data.session.activeView, playback.playing, data.assets), [data.companion, data.session.activeView, playback.playing, data.assets])
  const publish = useCallback(async () => {
    await invoke('set_companion_asset_scope', { ids: characterAssetIds(snapshot.characterPackage) })
    await emitTo('companion', 'companion:snapshot', snapshot)
  }, [snapshot])
  useEffect(() => {
    if (!isTauri()) return
    let stopHide: (() => void) | undefined; let stopOpen: (() => void) | undefined; let stopReady: (() => void) | undefined
    void listen('companion:hide-request', () => setCompanionDesktop(false)).then((stop) => { stopHide = stop })
    void listen('companion:open-main', () => { void getCurrentWindow().show(); void getCurrentWindow().setFocus() }).then((stop) => { stopOpen = stop })
    void listen('companion:ready', () => { void publish() }).then((stop) => { stopReady = stop })
    return () => { stopHide?.(); stopOpen?.(); stopReady?.() }
  }, [publish, setCompanionDesktop])
  useEffect(() => {
    if (!isTauri()) return
    void getAllWindows().then(async (windows) => {
      const desktop = windows.find((item) => item.label === 'companion')
      if (!desktop) return
      await publish()
      if (data.companion.desktop.visible) await desktop.show(); else await desktop.hide()
    })
  }, [data.companion.desktop.visible, publish])
  useEffect(() => {
    const trackId = data.session.currentTrackId
    if (!trackId || !playback.playing || learnedTrack.current === trackId || !data.companion.growth.enabled || !data.companion.permissions.musicContext) return
    learnedTrack.current = trackId
    setCompanionPersonality({ curiosity: data.companion.personality.curiosity + 1 }, '已授权的音乐偏好互动')
  }, [data.session.currentTrackId, playback.playing, data.companion.growth.enabled, data.companion.permissions.musicContext, data.companion.personality.curiosity, setCompanionPersonality])
  return null
}
