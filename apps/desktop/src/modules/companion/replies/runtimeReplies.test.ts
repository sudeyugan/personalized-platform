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
    expect(result.text).toContain('第一组真实结果'); expect(result.text).toContain('第二组真实结果')
    expect(result.text).toContain('分析说明'); expect(result.text).toContain('两组信息可以一起比较。')
    expect(result.text).not.toContain('"version"'); expect(current.streamed).not.toHaveBeenCalled()
    expect(result.session.events.filter(event => event.type === 'assistant')).toHaveLength(1)
  })
  it('falls back for malformed model output and retains mixed real outcomes', async () => {
    const current = fixture([call('test.first'), call('test.second'), { type: 'text', text: '| 完成 | 全部成功 | complete=false' }], { secondFails: true })
    const result = await runAgent(current.input)
    expect(result.text).toContain('## 部分结果'); expect(result.text).toContain('第一组真实结果')
    expect(result.text).toContain('第二组未返回'); expect(result.text).not.toMatch(/全部成功|complete=false|\| 完成/)
  })
  it('retains executed receipts on provider failure instead of reporting nothing happened', async () => {
    const current = fixture([call('test.first'), new Error('token=PRIVATE-SECRET')])
    const result = await runAgent(current.input)
    expect(result.text).toContain('本轮已停止'); expect(result.text).toContain('第一组真实结果')
    expect(result.text).not.toContain('PRIVATE-SECRET'); expect(result.audit).toHaveLength(1)
  })
  it('does not execute an extra step at the limit and still shows prior receipts', async () => {
    const current = fixture([call('test.first'), call('test.second')])
    const result = await runAgent({ ...current.input, maxToolSteps: 1 })
    expect(current.executed).toEqual(['test.first'])
    expect(result.text).toContain('第一组真实结果'); expect(result.text).toContain('本轮已停止')
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
