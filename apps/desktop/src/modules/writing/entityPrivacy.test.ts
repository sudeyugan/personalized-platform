import { describe, expect, it } from 'vitest'
import { anonymizeEntityReferences } from './entityPrivacy'

describe('AI entity redaction', () => {
  it('replaces stable entity identities while preserving unmarked context', () => {
    const result = anonymizeEntityReferences({ type: 'doc', content: [{ type: 'paragraph', content: [
      { type: 'text', text: '外婆', marks: [{ type: 'entityReference', attrs: { entityType: 'person', entityId: 'p1', label: '外婆' } }] },
      { type: 'text', text: '带我回到' },
      { type: 'text', text: '旧院子', marks: [{ type: 'entityReference', attrs: { entityType: 'place', entityId: 'l1', label: '旧院子' } }] },
      { type: 'text', text: '，外婆在门口等我。' },
    ] }] })
    expect(result.text).toBe('【人物1】带我回到【地点1】，外婆在门口等我。')
    expect(result.replacements).toBe(2)
    expect(result.text).not.toContain('旧院子')
  })

  it('uses the same alias for repeated marked mentions', () => {
    const mark = { type: 'entityReference', attrs: { entityType: 'person', entityId: 'p1', label: '小满' } }
    const result = anonymizeEntityReferences({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '小满', marks: [mark] }, { type: 'text', text: '遇见' }, { type: 'text', text: '小满', marks: [mark] }] }] })
    expect(result.text).toBe('【人物1】遇见【人物1】')
  })
})
