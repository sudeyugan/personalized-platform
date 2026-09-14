import { describe, expect, it } from 'vitest'
import { countChineseWords } from './wordCount'

describe('large chapter performance baseline', () => {
  it('serializes and counts a 100k-character chapter within the desktop budget', () => {
    const text = '一隅里的风声与旧日灯火。'.repeat(10_000).slice(0, 100_000)
    const document = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }
    const started = performance.now()
    const serialized = JSON.stringify(document)
    const words = countChineseWords(text)
    const elapsed = performance.now() - started
    expect(text).toHaveLength(100_000)
    expect(serialized.length).toBeGreaterThan(100_000)
    expect(words).toBeGreaterThan(50_000)
    expect(elapsed).toBeLessThan(1_000)
  })
})
