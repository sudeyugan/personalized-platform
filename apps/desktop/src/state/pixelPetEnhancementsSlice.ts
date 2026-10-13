import { normalizePixelEnhancements, type PixelPetEnhancements } from '../domain/pixelPetEnhancements'
import type { LibraryStore } from './libraryStoreTypes'
import { commitLibraryData, type LibraryStoreSetter } from './persistence'

export function createPixelPetEnhancementsSlice(get: () => LibraryStore, set: LibraryStoreSetter) {
  return { setCompanionPixelEnhancements(changes: Partial<PixelPetEnhancements>) {
    const current=get().data, desktop=current.companion.desktop
    const pixelEnhancements=normalizePixelEnhancements({ ...normalizePixelEnhancements(desktop.pixelEnhancements), ...changes })
    commitLibraryData({ ...current, companion:{ ...current.companion, desktop:{ ...desktop, pixelEnhancements } } }, set)
  } }
}
