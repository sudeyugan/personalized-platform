import { describe, expect, it } from 'vitest'
import { resolveDirectAction } from './directActions'
import type { AgentToolDefinition } from './types'

const openTool: AgentToolDefinition = {
  name: 'system.open',
  description: '打开网页',
  inputSchema: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'], additionalProperties: false },
  capability: 'system',
  risk: 'medium',
  scope: 'none',
}

describe('direct computer actions', () => {
  it('routes an explicit plain domain through system.open with HTTPS', () => {
    expect(resolveDirectAction('打开 bilibili.com', [openTool])).toMatchObject({
      name: 'system.open',
      arguments: { target: 'https://bilibili.com' },
    })
  })

  it('keeps an explicit HTTPS URL and supports browser wording', () => {
    expect(resolveDirectAction('请在浏览器中访问 https://www.bilibili.com/video/BV1', [openTool])).toMatchObject({
      name: 'system.open',
      arguments: { target: 'https://www.bilibili.com/video/BV1' },
    })
  })

  it('does not route discussion, negation or unavailable tools as an action', () => {
    expect(resolveDirectAction('不要打开 bilibili.com', [openTool])).toBeUndefined()
    expect(resolveDirectAction('为什么有时打不开 bilibili.com？', [openTool])).toBeUndefined()
    expect(resolveDirectAction('打开 bilibili.com', [])).toBeUndefined()
  })
})