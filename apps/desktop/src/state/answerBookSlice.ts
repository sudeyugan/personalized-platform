import type { AnswerBookFavorite, LibraryData } from '../domain/models'
import type { LibraryStore } from './libraryStoreTypes'
import { commitLibraryData, type LibraryStoreSetter } from './persistence'

type SetStore = LibraryStoreSetter
type AnswerBookActions = 'addAnswerBookFavorite' | 'deleteAnswerBookFavorite'

const commit = (data: LibraryData, set: SetStore) => {
  commitLibraryData(data, set)
}

export function createAnswerBookSlice(get: () => LibraryStore, set: SetStore): Pick<LibraryStore, AnswerBookActions> {
  return {
    addAnswerBookFavorite: ({ question, answer }) => {
      const cleanQuestion = question.trim()
      const cleanAnswer = answer.trim()
      if (!cleanQuestion || !cleanAnswer) return
      const current = get().data
      const favorite: AnswerBookFavorite = {
        id: `answer-favorite-${crypto.randomUUID()}`,
        question: cleanQuestion,
        answer: cleanAnswer,
        createdAt: new Date().toISOString(),
      }
      commit({ ...current, answerBook: { favorites: [favorite, ...current.answerBook.favorites] } }, set)
    },
    deleteAnswerBookFavorite: (id) => {
      const current = get().data
      commit({ ...current, answerBook: { favorites: current.answerBook.favorites.filter((item) => item.id !== id) } }, set)
    },
  }
}
