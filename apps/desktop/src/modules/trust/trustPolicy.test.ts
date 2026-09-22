import { describe, expect, it } from 'vitest'
import { createSeedLibrary } from '../../domain/seed'
import type { AgentContextSnapshot } from '../companion/agent/types'
import { applyContextPrivacy, applyHistoryPrivacy, assertExternalAiAllowed, TrustPolicyError } from './trustPolicy'

describe('trust policy', () => {
  it('blocks external providers locally while keeping mock available', () => {
    const trust = createSeedLibrary().settings.trust
    expect(() => assertExternalAiAllowed('mock', trust, 'companion')).not.toThrow()
    expect(() => assertExternalAiAllowed('deepseek', trust, 'companion')).toThrow(TrustPolicyError)
  })

  it('removes authorized context and history when sharing is disabled', () => {
    const trust = { ...createSeedLibrary().settings.trust, shareAuthorizedContext: false, shareRecentConversation: false }
    const context: AgentContextSnapshot = { page: 'writing', companion: { name: '小隅' }, localTime: { timeZone: 'Asia/Shanghai', date: '2026-09-22', time: '12:00:00', weekday: '星期二', period: '中午' }, activeWork: { id: 'work-1', title: '私密作品' }, activeChapter: { id: 'chapter-1', title: '私密章节' }, selection: '私密选区' }
    expect(applyContextPrivacy(context, trust)).toEqual({ page: 'writing', companion: { name: '小隅' }, localTime: context.localTime })
    expect(applyHistoryPrivacy([{ role: 'user', content: '上一轮私密对话' }], trust)).toEqual([])
  })
})
