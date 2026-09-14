import { describe, expect, it } from 'vitest'
import { countChineseWords } from './wordCount'

describe('countChineseWords', () => {
  it('counts Chinese characters and Latin words while ignoring punctuation', () => {
    expect(countChineseWords('那一年，hello world！')).toBe(5)
  })

  it('treats connected English and numbers as words', () => {
    expect(countChineseWords("AI 写作 2026 isn't magic")).toBe(6)
  })
})
