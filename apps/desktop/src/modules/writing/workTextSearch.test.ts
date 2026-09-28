import { describe, expect, it } from 'vitest'
import type { JSONContent } from '@tiptap/react'
import { contentToPlainText, countContentMatches, replaceTextInContent } from './workTextSearch'

const content: JSONContent = { type: 'doc', content: [
  { type: 'paragraph', content: [{ type: 'text', text: 'Old old', marks: [{ type: 'bold' }] }, { type: 'text', text: ' unchanged' }] },
  { type: 'paragraph', content: [{ type: 'text', text: 'OLD ending' }] },
] }

describe('work text search', () => {
  it('counts case-insensitive matches in text nodes', () => {
    expect(countContentMatches(content, 'old')).toBe(3)
    expect(countContentMatches(content, '   ')).toBe(0)
  })
  it('replaces text without removing rich-text marks', () => {
    const result = replaceTextInContent(content, 'old', 'new')
    expect(result.count).toBe(3)
    expect(result.content.content?.[0].content?.[0].text).toBe('new new')
    expect(result.content.content?.[0].content?.[0].marks).toEqual([{ type: 'bold' }])
    expect(content.content?.[0].content?.[0].text).toBe('Old old')
  })
  it('derives readable plain text from block content', () => {
    expect(contentToPlainText(replaceTextInContent(content, 'old', 'new').content)).toBe('new new unchanged\nnew ending')
  })
})
