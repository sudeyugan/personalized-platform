import { describe, expect, it, vi } from 'vitest'
import { createSeedLibrary } from '../../../domain/seed'
import { createAgentApplicationServices } from '../agent/applicationServices'
import { buildAgentAccess, buildAgentContext } from '../agent/context'
import { AgentPermissionEngine } from '../agent/permission'
import { runAgent } from '../agent/runtime'
import { AgentToolRegistry } from '../agent/toolRegistry'
import type { AgentModelProvider, AgentModelResponse } from '../agent/types'

function fixture(responses: Array<AgentModelResponse | Error>, options: { secondFails?: boolean; deferred?: Promise<unknown> } = {}) {
  const data = createSeedLibrary(), access = buildAgentAccess(data, [])
  const executed: string[] = [], streamed = vi.fn(), sessions: unknown[] = []
  const registry = new AgentToolRegistry()
  for (const name of ['test.first', 'test.second']) registry.register({
    definition: { name, description: name === 'test.first' ? '读取第一组' : '读取第二组', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, capability: 'read', risk: 'read_only', scope: 'none' },
    execute: async () => {
      executed.push(name)
      if (name === 'test.second' && options.secondFails) throw new Error('第二组未返回')
      if (options.deferred) return options.deferred
      return [{ title: name === 'test.first' ? '第一组真实结果' : '第二组真实结果' }]
    },
  })
  const provider: AgentModelProvider = {
    id: 'structured-test', testConnection: async () => 'ok',
    generate: vi.fn(async (request, callbacks) => {
      sessions.push(request.messages)
      const response = responses.shift()
      if (response instanceof Error) throw response
      if (!response) throw new Error('NO_RESPONSE')
      if (response.type === 'text') callbacks?.onTextDelta?.(response.text)
      return response
    }),
  }
  const input = { message: '整理这两组信息', history: [], context: buildAgentContext(data, access), services: createAgentApplicationServices(data, access), registry, provider,
    permissions: new AgentPermissionEngine({ policy: { autoAllow: ['read'] }, resourcePermissions: data.companion.permissions, access }), onTextDelta: streamed }
  return { input, executed, streamed, sessions }
}
const call = (name: string): AgentModelResponse => ({ type: 'tool_call', call: { id: name, name, arguments: {} } })
const explanation = (text: string): AgentModelResponse => ({ type: 'text', text: JSON.stringify({ version: 1, blocks: [{ type: 'paragraph', text }] }) })

describe('runtime unified replies', () => {
  it('runs every step before aggregating, while buffering structured model output', async () => {
    const current = fixture([call('test.first'), call('test.second'), explanation('两组信息可以一起比较。')])
    const result = await runAgent(current.input)
    expect(current.executed).toEqual(['test.first', 'test.second'])
    expect(result.audit).toHaveLength(2)
    expect(result.text).toBe('两组信息可以一起比较。')
    expect(result.text).not.toContain('"version"'); expect(current.streamed).not.toHaveBeenCalled()
    expect(result.session.events.filter(event => event.type === 'assistant')).toHaveLength(1)
  })
  it('falls back for malformed model output and retains mixed real outcomes', async () => {
    const current = fixture([call('test.first'), call('test.second'), { type: 'text', text: '| 完成 | 全部成功 | complete=false' }], { secondFails: true })
    const result = await runAgent(current.input)
    expect(result.text).toContain('还没能整理出可靠的结论'); expect(result.text).toContain('第一组真实结果')
    expect(result.text).toContain('第二组未返回'); expect(result.text).not.toMatch(/全部成功|complete=false|\| 完成/)
  })
  it('repairs a malformed answer once, without repeating tools or exposing the invalid format', async () => {
    const current = fixture([call('test.first'), { type: 'text', text: '| 原始表格 |' }, explanation('这是整理后的结论。')])
    const result = await runAgent(current.input)
    expect(result.text).toBe('这是整理后的结论。')
    expect(current.executed).toEqual(['test.first'])
    expect(current.input.provider.generate).toHaveBeenCalledTimes(3)
    expect(vi.mocked(current.input.provider.generate).mock.calls[2][0].tools).toEqual([])
    expect(current.streamed).not.toHaveBeenCalled()
  })
  it('does not execute a hallucinated tool during the answer-only repair round', async () => {
    const current = fixture([call('test.first'), { type: 'text', text: 'not JSON' }, call('test.second')])
    const result = await runAgent(current.input)
    expect(current.executed).toEqual(['test.first'])
    expect(result.text).toContain('没有再次执行工具')
  })
  it('retains conversation context for follow-ups and asks the model to resolve missing query parameters', async () => {
    const current = fixture([{ type: 'text', text: '想查哪个城市的天气？' }])
    const result = await runAgent({ ...current.input, message: '明天还会下雨吗？' })
    expect(result.text).toBe('想查哪个城市的天气？')
    const request = vi.mocked(current.input.provider.generate).mock.calls[0][0]
    expect(request.messages.some(message => message.role === 'system' && message.content.includes('不从搜索排名'))).toBe(true)
    const followup = fixture([explanation('明天需要带伞。')])
    await runAgent({ ...followup.input, message: '明天还会下雨吗？', history: [{ role: 'user', content: '查北京的天气' }] })
    expect(vi.mocked(followup.input.provider.generate).mock.calls[0][0].messages).toContainEqual({ role: 'user', content: '查北京的天气' })
  })
  it('retains executed receipts on provider failure instead of reporting nothing happened', async () => {
    const current = fixture([call('test.first'), new Error('token=PRIVATE-SECRET')])
    const result = await runAgent(current.input)
    expect(result.text).toContain('后续模型说明未生成'); expect(result.text).toContain('第一组真实结果')
    expect(result.text).not.toContain('PRIVATE-SECRET'); expect(result.audit).toHaveLength(1)
  })
  it('does not execute an extra step at the limit and still shows prior receipts', async () => {
    const current = fixture([call('test.first'), call('test.second')])
    const result = await runAgent({ ...current.input, maxToolSteps: 1 })
    expect(current.executed).toEqual(['test.first'])
    expect(result.text).toContain('第一组真实结果'); expect(result.text).toContain('最多 1 次工具调用')
  })
  it('cancels without emitting a late private result or relaxing the original abort boundary', async () => {
    let resolve!: (value: unknown) => void
    const deferred = new Promise<unknown>(done => { resolve = done })
    const current = fixture([call('test.first'), explanation('不应出现的解释')], { deferred })
    const controller = new AbortController(), audited = vi.fn()
    const pending = runAgent({ ...current.input, signal: controller.signal, onAudit: audited })
    await vi.waitFor(() => expect(current.executed).toEqual(['test.first']))
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'AgentCancelled' })
    resolve([{ title: 'PRIVATE-LATE-RESULT' }])
    await Promise.resolve(); await Promise.resolve()
    expect(audited).not.toHaveBeenCalled(); expect(current.streamed).not.toHaveBeenCalled()
    expect(current.sessions).toHaveLength(1)
  })
})
