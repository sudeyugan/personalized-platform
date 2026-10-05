import { chooseFortune } from '../domain/fortune'
import type { LibraryStore } from './libraryStoreTypes'
import { commitLibraryData, type LibraryStoreSetter } from './persistence'

export function createFortuneSlice(get: () => LibraryStore, set: LibraryStoreSetter): Pick<LibraryStore, 'drawFortune'> {
  return {
    drawFortune: () => {
      const data = get().data
      const today = chooseFortune(data.fortune?.today)
      if (today === data.fortune?.today) return today
      commitLibraryData({ ...data, fortune: { today } }, set)
      return today
    },
  }
}
