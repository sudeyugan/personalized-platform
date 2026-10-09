import { answerBookAnswers } from './answers'

export function drawRandomAnswer() {
  const random = new Uint32Array(1)
  crypto.getRandomValues(random)
  return answerBookAnswers[Math.floor((random[0] / 2 ** 32) * answerBookAnswers.length)]
}
