import { chooseFortune, FORTUNE_KEYS } from '../domain/fortune'
import { formatLocalDate } from '../domain/localDate'
import type { LibraryStore } from './libraryStoreTypes'
import { commitLibraryData, type LibraryStoreSetter } from './persistence'

export function createFortuneSlice(get: () => LibraryStore, set: LibraryStoreSetter): Pick<LibraryStore, 'drawFortune'> {
  return {
    drawFortune: (kind = 'daily') => {
      const data = get().data, key = FORTUNE_KEYS[kind]
      const previous = data.fortune?.[key]
      const today = chooseFortune(previous, formatLocalDate(), Math.random, kind)
      if (today === previous) return today
      commitLibraryData({ ...data, fortune: { ...data.fortune, [key]: today } }, set)
      return today
    },
  }
}
