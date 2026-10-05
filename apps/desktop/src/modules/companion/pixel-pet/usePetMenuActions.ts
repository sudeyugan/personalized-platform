import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useEffect } from 'react'
import { useLibraryStore } from '../../../state/useLibraryStore'
import { validPetMenuAction } from './menuActions'

// Main window remains the only owner of saved settings and navigation.
export function usePetMenuActions() {
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return
    let disposed = false, stop: (() => void) | undefined
    void listen<unknown>('companion:pet-menu-action', ({ payload }) => {
      if (disposed || !validPetMenuAction(payload)) return
      const store = useLibraryStore.getState()
      if (!store.data.companion.desktop.pixelPetEnabled) return
      if (payload.kind === 'style') store.setCompanionPetStyle(payload.value)
      else if (payload.kind === 'side') store.setCompanionPetSide(payload.value)
      else if (payload.kind === 'hide') store.setCompanionDesktop(false)
      else {
        store.navigate('settings')
        void getCurrentWindow().show().then(() => getCurrentWindow().setFocus()).catch(() => undefined)
      }
    }).then(unlisten => { if (disposed) unlisten(); else stop = unlisten }).catch(() => undefined)
    return () => { disposed = true; stop?.() }
  }, [])
}
