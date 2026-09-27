import type { LibraryData } from '../domain/models'
import { libraryRepository } from '../infrastructure/libraryRepository'
import type { LibraryStore } from './libraryStoreTypes'

export type LibraryStoreSetter = (
  partial: Partial<LibraryStore> | ((state: LibraryStore) => Partial<LibraryStore>),
) => void

export function queueLibrarySave(data: LibraryData, set: LibraryStoreSetter) {
  set({ saveStatus: 'saving' })
  void libraryRepository.save(data).then(() => {
    set((state) => state.data === data ? { saveStatus: 'saved' } : {})
  }).catch(() => {
    set({ saveStatus: 'error' })
  })
}

export function commitLibraryData(data: LibraryData, set: LibraryStoreSetter) {
  set({ data })
  queueLibrarySave(data, set)
}
