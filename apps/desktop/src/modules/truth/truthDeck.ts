import { truthQuestions } from './questions'

export function shuffledTruthDeck(previousLast?: number, random = secureRandom) {
  const deck = truthQuestions.map((_, index) => index)
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1))
    ;[deck[index], deck[other]] = [deck[other], deck[index]]
  }
  // 新一轮也不让上一轮的最后一题紧邻重复。
  if (deck.length > 1 && deck[0] === previousLast) {
    ;[deck[0], deck[1]] = [deck[1], deck[0]]
  }
  return deck
}

function secureRandom() {
  const value = new Uint32Array(1)
  crypto.getRandomValues(value)
  return value[0] / 2 ** 32
}
