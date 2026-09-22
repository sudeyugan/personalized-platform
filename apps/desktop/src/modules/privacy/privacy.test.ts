import { describe, expect, it } from 'vitest'
import type { AgentModelProvider } from '../companion/agent/types'
import { detectPrivacy } from './detectors'
import { createPrivacyProtectedProvider } from './egressGateway'
import { PrivacyEgressError } from './types'

const trust = { externalAiProcessing: true, shareAuthorizedContext: true, shareRecentConversation: true, retainConversationHistory: true, outboundProtection: true, outboundReviewMode: 'balanced' as const, privateDictionary: [{ id: 'one', value: '林夏', category: 'person' as const, enabled: true }] }
const request = (content: string) => ({ messages: [{ role: 'user' as const, content }], context: { page: 'home', companion: { name: '小鱼' }, localTime: { timeZone: 'Asia/Shanghai' as const, date: '2026-09-22', time: '10:00:00', weekday: '星期二', period: '上午' } }, tools: [] })

describe('privacy egress', () => {
  it('detects Chinese phone, valid identity card and private dictionary terms', () => {
    const findings = detectPrivacy('林夏的电话是13800138000，身份证11010519491231002X。', trust.privateDictionary)
    expect(findings.map((item) => item.kind)).toEqual(['person', 'phone', 'identity'])
  })

  it('blocks secrets before a provider is called', async () => {
    let called = false
    const base: AgentModelProvider = { id: 'deepseek', testConnection: async () => '', generate: async () => { called = true; return { type: 'text', text: '' } } }
    const provider = createPrivacyProtectedProvider(base, { trust, destination: 'DeepSeek', purpose: 'test' })
    await expect(provider.generate(request('api_key=sk-abcdefghijklmnopqrstuvwxyz'))).rejects.toBeInstanceOf(PrivacyEgressError)
    expect(called).toBe(false)
  })

  it('uses stable aliases, restores replies and asks once before sending', async () => {
    const sent: string[] = []; let reviews = 0
    const base: AgentModelProvider = { id: 'deepseek', testConnection: async () => '', generate: async (value) => { sent.push(value.messages.at(-1)?.content ?? ''); return { type: 'text', text: '找到[PERSON_1]，电话[PHONE_1]' } } }
    const provider = createPrivacyProtectedProvider(base, { trust, destination: 'DeepSeek', purpose: 'test', requestReview: async () => { reviews += 1; return true } })
    const response = await provider.generate(request('查找林夏，电话13800138000'))
    expect(sent[0]).toBe('查找[PERSON_1]，电话[PHONE_1]')
    expect(response).toEqual({ type: 'text', text: '找到林夏，电话13800138000' })
    expect(reviews).toBe(1)
  })

  it('restores split streaming aliases and tool call arguments locally', async () => {
    let step = 0; const chunks: string[] = []
    const base: AgentModelProvider = {
      id: 'deepseek', testConnection: async () => '',
      generate: async (_value, options) => {
        step += 1
        if (step === 1) return { type: 'tool_call', call: { id: 'call-1', name: 'character.search', arguments: { query: '[PERSON_1]' } } }
        options?.onTextDelta?.('认识[PER'); options?.onTextDelta?.('SON_1]。')
        return { type: 'text', text: '认识[PERSON_1]。' }
      },
    }
    const provider = createPrivacyProtectedProvider(base, { trust, destination: 'DeepSeek', purpose: 'test', requestReview: async () => true })
    const call = await provider.generate(request('查找林夏'))
    expect(call).toMatchObject({ type: 'tool_call', call: { arguments: { query: '林夏' } } })
    const response = await provider.generate(request('林夏'))
    expect(response).toEqual({ type: 'text', text: '认识林夏。' })
    await provider.generate(request('林夏'), { onTextDelta: (delta) => chunks.push(delta) })
    expect(chunks.join('')).toBe('认识林夏。')
  })
})
