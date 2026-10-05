import { describe, expect, it } from 'vitest'
import { detectActionIntent, resolveDirectAction } from './directActions'
import type { AgentToolDefinition } from './types'

const openTool: AgentToolDefinition = {
  name: 'system.open',
  description: '打开网页',
  inputSchema: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'], additionalProperties: false },
  capability: 'system',
  risk: 'medium',
  scope: 'none',
}

const lowRiskTool = (name: string): AgentToolDefinition => ({
  name,
  description: name,
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  capability: 'presentation',
  risk: 'low',
  scope: 'none',
})

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

  it('routes stable in-app navigation and simple controls directly', () => {
    const tools = [lowRiskTool('app.open'), lowRiskTool('music.control'), lowRiskTool('screen.capture')]
    expect(resolveDirectAction('打开本月情绪回望', tools)).toMatchObject({ name: 'app.open', arguments: { destination: 'mood.reflection', range: 'month' } })
    expect(resolveDirectAction('下一首', tools)).toMatchObject({ name: 'music.control', arguments: { action: 'next' } })
    expect(resolveDirectAction('帮我截屏', tools)).toMatchObject({ name: 'screen.capture', arguments: { source: 'desktop' } })
  })

  it('marks complex explicit actions for model correction without guessing arguments', () => {
    expect(detectActionIntent('帮我创建一个明晚散步的待办', [lowRiskTool('todo.create')])).toMatchObject({ expectsTool: true, directCall: undefined })
    expect(detectActionIntent('小鱼录个视频介绍一下自己', [lowRiskTool('task.create')])).toMatchObject({ expectsTool: true, directCall: undefined, requiresTaskPlan: true })
    expect(detectActionIntent('为什么不能创建待办？', [lowRiskTool('todo.create')])).toEqual({ expectsTool: false })
    expect(detectActionIntent('10秒的视频来介绍你自己。', [lowRiskTool('task.create')])).toMatchObject({ expectsTool: true, requiresTaskPlan: true })
    expect(detectActionIntent('我刚才打开设置后看到了权限项', [lowRiskTool('app.open')])).toEqual({ expectsTool: false })
  })
})

it('routes literal current-name addresses and keeps discussion non-mutating', () => {
  expect(resolveDirectAction('阿璃，打开首页', [lowRiskTool('app.open')], '阿璃')).toMatchObject({ name: 'app.open' })
  expect(resolveDirectAction('A[1]打开首页', [lowRiskTool('app.open')], 'A[1]')).toMatchObject({ name: 'app.open' })
  expect(detectActionIntent('阿璃为什么不能录视频介绍自己', [lowRiskTool('task.create')], '阿璃')).toEqual({ expectsTool: false })
  expect(resolveDirectAction('小鱼打开首页', [lowRiskTool('app.open')], '阿璃')).toBeUndefined()
})
