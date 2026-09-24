import { describe, expect, it } from 'vitest'
import { isLowQualityDailyQuestion, validateDailyQuestionDraft } from './dailyQuestionProvider'

const validDraft = {
  question: '你最近一次说“没关系”时，是真的释然，还是害怕表达不满会让自己显得难相处？',
  background: '有时体谅是真正的宽容，有时却是避免冲突和被拒绝的方法。',
  followUp: '如果不再用懂事维持这段关系，你最担心失去什么？',
  topic: '懂事与边界',
}

describe('daily question quality', () => {
  it('accepts a concrete self-reflection question', () => {
    expect(validateDailyQuestionDraft(validDraft).errors).toEqual([])
  })

  it('rejects imaginary binary-choice questions', () => {
    const draft = validateDailyQuestionDraft({ ...validDraft, question: '如果有一天你突然能听见所有人的内心独白，你会更愿意与人亲近，还是更想远离？' })
    expect(draft.errors).toContain('不得使用虚构能力、空泛假设或二选一')
    expect(isLowQualityDailyQuestion(draft.question)).toBe(true)
  })
})