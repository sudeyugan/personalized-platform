import { listen } from '@tauri-apps/api/event'
import { useEffect } from 'react'
import { useLibraryStore } from '../../../state/useLibraryStore'
import type { CompanionPetSide } from '../../../domain/models'

export function usePetPoseSync() {
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return
    let disposed = false, stop: (() => void) | undefined
    void listen<{ side: CompanionPetSide }>('companion:pet-side', ({ payload }) => {
      if (disposed || !['left-edge', 'right-edge', 'bottom-edge'].includes(payload?.side)) return
      const store = useLibraryStore.getState()
      if (store.data.companion.desktop.pixelPetEnabled && store.data.companion.desktop.pixelPetSide !== payload.side) store.setCompanionPetSide(payload.side)
    }).then(unlisten => { if (disposed) unlisten(); else stop = unlisten }).catch(() => undefined)
    return () => { disposed = true; stop?.() }
  }, [])
}
