import { describe, expect, it } from 'vitest'
import { truthQuestions } from './questions'
import { shuffledTruthDeck } from './truthDeck'
import { createSeedLibrary, normalizeLibrary } from '../../domain/seed'

describe('truth question deck', () => {
  it('contains 150 distinct original questions without empty entries', () => {
    expect(truthQuestions).toHaveLength(150)
    expect(new Set(truthQuestions).size).toBe(150)
    expect(truthQuestions.every((question) => question.trim().length > 0 && question.includes('？'))).toBe(true)
  })
  it('draws every question once per shuffled round without mutating the source', () => {
    const original = [...truthQuestions]
    for (const random of [() => 0, () => .5, () => .999999]) {
      const deck = shuffledTruthDeck(undefined, random)
      expect(deck).toHaveLength(150)
      expect([...deck].sort((a, b) => a - b)).toEqual(truthQuestions.map((_, index) => index))
    }
    expect(truthQuestions).toEqual(original)
  })
  it('does not repeat the previous final question at a new round boundary', () => {
    const previousLast = shuffledTruthDeck(undefined, () => 0)[0]
    expect(shuffledTruthDeck(previousLast, () => 0)[0]).not.toBe(previousLast)
  })
  it('adds the module and navigation to old libraries, keeping a stored switch and order', () => {
    const legacy = createSeedLibrary()
    legacy.settings.modules = legacy.settings.modules.filter((item) => item.id !== 'truth')
    legacy.settings.navigationOrder = legacy.settings.navigationOrder.filter((id) => id !== 'truth')
    const normalized = normalizeLibrary(legacy)
    expect(normalized.settings.modules.find((item) => item.id === 'truth')).toMatchObject({ enabled: true, available: true })
    expect(normalized.settings.navigationOrder.indexOf('truth')).toBe(normalized.settings.navigationOrder.indexOf('answerBook') + 1)
    normalized.settings.modules.find((item) => item.id === 'truth')!.enabled = false
    normalized.settings.navigationOrder.reverse()
    const reloaded = normalizeLibrary(JSON.parse(JSON.stringify(normalized)))
    expect(reloaded.settings.modules.find((item) => item.id === 'truth')?.enabled).toBe(false)
    expect(reloaded.settings.navigationOrder).toEqual(normalized.settings.navigationOrder)
  })
})
