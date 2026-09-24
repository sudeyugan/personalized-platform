import { describe, expect, it } from 'vitest'
import { createSeedLibrary } from '../../../domain/seed'
import { createAgentApplicationServices } from './applicationServices'
import { buildAgentAccess, buildAgentContext } from './context'
import { AgentPermissionEngine } from './permission'
import { AgentRuntimeError, runAgent } from './runtime'
import { AgentToolRegistry } from './toolRegistry'
import { createCompanionToolRegistry } from './tools'
import type { AgentModelProvider, AgentModelRequest, AgentModelResponse } from './types'

class ScriptedProvider implements AgentModelProvider {
  readonly id = 'scripted'
  readonly requests: AgentModelRequest[] = []
  private readonly responses: AgentModelResponse[]
  constructor(responses: AgentModelResponse[]) { this.responses = responses }
  async testConnection() { return 'ok' }
  async generate(request: AgentModelRequest) {
    this.requests.push(request)
    const response = this.responses.shift()
    if (!response) throw new Error('SCRIPT_EXHAUSTED')
    return response
  }
}

function fixture(records = true) {
  const data = createSeedLibrary()
  const work = data.works[0]
  data.companion.permissions.workIds = [work.id]
  data.companion.permissions.records = records
  const access = buildAgentAccess(data, [])
  return {
    data,
    access,
    context: buildAgentContext(data, access),
    services: createAgentApplicationServices(data, access),
    permissions: new AgentPermissionEngine({ policy: { autoAllow: ['read'] }, resourcePermissions: data.companion.permissions, access }),
  }
}

describe('agent tool registry', () => {
  it('registers and looks up tools without exposing handlers in definitions', () => {
    const registry = createCompanionToolRegistry()
    expect(registry.lookup('character.search')?.definition.risk).toBe('read_only')
    expect(registry.lookup('place.search')?.definition.scope).toBe('records')
    expect(registry.lookup('timeline.search')?.definition.scope).toBe('records')
    expect(registry.lookup('todo.update')?.definition.capability).toBe('modify')
    expect(registry.lookup('calendar.update_event')?.definition.risk).toBe('medium')
    expect(registry.lookup('chapter.append')?.definition.scope).toBe('chapters')
    expect(registry.lookup('record.update')?.definition.scope).toBe('records')
    expect(registry.lookup('course.create')?.definition.capability).toBe('create')
    expect(registry.definitions().length).toBeGreaterThanOrEqual(40)
    expect(registry.lookup('diary.search')?.definition.scope).toBe('diary')
    expect(registry.lookup('mood.get_summary')?.definition.scope).toBe('mood')
    expect(registry.lookup('app.open')?.definition.capability).toBe('presentation')
    expect(registry.lookup('web.search')?.definition).toMatchObject({ capability: 'external', scope: 'web' })
    expect(registry.lookup('asset.list')).toBeUndefined()
    expect(() => registry.register(registry.lookup('character.search')!)).toThrow('already registered')
  })

  it('validates arguments before execution', async () => {
    const current = fixture()
    const result = await createCompanionToolRegistry().execute({ id: '1', name: 'chapter.search', arguments: {} }, current.services)
    expect(result).toEqual({ success: false, error: { code: 'InvalidArguments', message: expect.any(String) } })
  })

  it('executes registered tools and normalizes handler failures', async () => {
    const current = fixture()
    const success = await createCompanionToolRegistry().execute({ id: '1', name: 'character.search', arguments: { query: '外婆' } }, current.services)
    expect(success.success && (success.data as { name: string }[])[0].name).toBe('外婆')
    const registry = new AgentToolRegistry().register({
      definition: { name: 'test.fail', description: 'fail', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, capability: 'read', risk: 'read_only', scope: 'none' },
      execute: () => { throw new Error('boom') },
    })
    await expect(registry.execute({ id: '2', name: 'test.fail', arguments: {} }, current.services)).resolves.toMatchObject({ success: false, error: { code: 'ExecutionFailed' } })
    await expect(registry.execute({ id: '3', name: 'missing', arguments: {} }, current.services)).resolves.toMatchObject({ success: false, error: { code: 'ToolNotFound' } })
  })

  it('reads personal modules only after their resource scope is granted', async () => {
    const current = fixture()
    current.data.planner.diaryEntries.push({ date: '2026-09-23', title: '今天', content: '完成了统一 Agent 接入', updatedAt: new Date().toISOString() })
    const locked = current.permissions.check(createCompanionToolRegistry().lookup('diary.search')!.definition, { query: 'Agent' })
    expect(locked.allowed).toBe(false)
    current.data.companion.permissions.diary = true
    const access = buildAgentAccess(current.data, [])
    const services = createAgentApplicationServices(current.data, access)
    const allowed = new AgentPermissionEngine({ policy: { autoAllow: ['read'] }, resourcePermissions: current.data.companion.permissions, access })
    expect(allowed.check(createCompanionToolRegistry().lookup('diary.search')!.definition, { query: 'Agent' }).allowed).toBe(true)
    await expect(createCompanionToolRegistry().execute({ id: 'diary-1', name: 'diary.search', arguments: { query: 'Agent' } }, services)).resolves.toMatchObject({ success: true, data: [{ date: '2026-09-23' }] })
  })

  it('allows controlled web search only after the internet permission is enabled', () => {
    const current = fixture()
    const tool = createCompanionToolRegistry().lookup('web.search')!.definition
    expect(current.permissions.check(tool, { query: '北京天气' }).allowed).toBe(false)
    current.data.companion.permissions.internet = true
    const access = buildAgentAccess(current.data, [])
    const permissions = new AgentPermissionEngine({ policy: { autoAllow: ['read'] }, resourcePermissions: current.data.companion.permissions, access })
    expect(permissions.check(tool, { query: '北京天气' }).allowed).toBe(true)
  })

  it('keeps visual-state selection inside the typed low-risk tool boundary', async () => {
    const current = fixture()
    let selected = 'idle'
    const registry = createCompanionToolRegistry((state) => { selected = state })
    expect(registry.lookup('companion.set_state')?.definition).toMatchObject({ capability: 'presentation', risk: 'low' })
    await expect(registry.execute({ id: 'state-1', name: 'companion.set_state', arguments: { state: 'happy' } }, current.services)).resolves.toMatchObject({ success: true })
    expect(selected).toBe('happy')
    await expect(registry.execute({ id: 'state-2', name: 'companion.set_state', arguments: { state: 'unknown' } }, current.services)).resolves.toMatchObject({ success: false, error: { code: 'InvalidArguments' } })
  })
})

describe('agent runtime', () => {
  it('returns direct model text without invoking a tool', async () => {
    const current = fixture()
    const provider = new ScriptedProvider([{ type: 'text', text: '我在这里。' }])
    const result = await runAgent({ message: '你好', history: [], provider, registry: createCompanionToolRegistry(), ...current })
    expect(result.text).toBe('我在这里。')
    expect(result.audit).toHaveLength(0)
  })

  it('runs model to tool to result to model and records append-only events', async () => {
    const current = fixture()
    const provider = new ScriptedProvider([
      { type: 'tool_call', call: { id: 'call-1', name: 'character.search', arguments: { query: '外婆' } } },
      { type: 'text', text: '你写过外婆。' },
    ])
    const result = await runAgent({ message: '我写过外婆吗？', history: [], provider, registry: createCompanionToolRegistry(), ...current })
    expect(result.text).toBe('你写过外婆。')
    expect(provider.requests[1].messages.at(-1)).toMatchObject({ role: 'tool', toolName: 'character.search' })
    expect(result.session.events.map((event) => event.type)).toEqual(['context', 'user', 'tool_call', 'tool_result', 'assistant'])
    expect(result.audit[0]).toMatchObject({ permissionDecision: 'allowed', resultStatus: 'success', toolName: 'character.search' })
  })

  it('returns permission denial to the model without running the tool', async () => {
    const current = fixture(false)
    const provider = new ScriptedProvider([
      { type: 'tool_call', call: { id: 'call-1', name: 'character.search', arguments: { query: '外婆' } } },
      { type: 'text', text: '人物资料尚未授权。' },
    ])
    const result = await runAgent({ message: '查人物', history: [], provider, registry: createCompanionToolRegistry(), ...current })
    expect(result.text).toBe('人物资料尚未授权。')
    expect(result.audit[0]).toMatchObject({ permissionDecision: 'denied', errorCode: 'PermissionDenied' })
    expect(provider.requests[1].messages.at(-1)?.content).toContain('PermissionDenied')
  })

  it('executes an enabled write tool only after explicit confirmation', async () => {
    const current = fixture()
    current.data.companion.permissions.writeActions = true
    current.data.companion.permissions.todos = true
    current.data.companion.permissions.writePolicy = 'always_ask'
    let created = ''
    current.services.createTodo = (title) => { created = title; return { created: true } }
    const provider = new ScriptedProvider([
      { type: 'tool_call', call: { id: 'write-1', name: 'todo.create', arguments: { title: '今晚散步' } } },
      { type: 'text', text: '已经为你创建了待办。' },
    ])
    let requested = ''
    const result = await runAgent({
      message: '帮我加一个今晚散步的待办',
      history: [],
      provider,
      registry: createCompanionToolRegistry(),
      requestPermission: async ({ tool }) => { requested = tool.name; return true },
      ...current,
    })
    expect(requested).toBe('todo.create')
    expect(created).toBe('今晚散步')
    expect(result.audit[0]).toMatchObject({ permissionDecision: 'allowed', resultStatus: 'success' })
  })

  it('does not ask for confirmation when write access is disabled', async () => {
    const current = fixture()
    const provider = new ScriptedProvider([
      { type: 'tool_call', call: { id: 'write-2', name: 'todo.create', arguments: { title: '不应创建' } } },
      { type: 'text', text: '写入权限尚未开启。' },
    ])
    let confirmationRequested = false
    const result = await runAgent({
      message: '创建待办',
      history: [],
      provider,
      registry: createCompanionToolRegistry(),
      requestPermission: async () => { confirmationRequested = true; return true },
      ...current,
    })
    expect(confirmationRequested).toBe(false)
    expect(result.audit[0]).toMatchObject({ permissionDecision: 'denied', errorCode: 'PermissionDenied' })
  })

  it('asks for short spoken answers when the turn came from the microphone', async () => {
    const current = fixture()
    const provider = new ScriptedProvider([{ type: 'text', text: '简短回答。' }])
    await runAgent({ message: '今天怎么样', history: [], provider, registry: createCompanionToolRegistry(), responseMode: 'voice', voiceReplyLength: 'short', ...current })
    expect(provider.requests[0].messages.find((message) => message.role === 'system')?.content).toContain('2 至 4 句')
  })

  it('lets the model recover from invalid arguments', async () => {
    const current = fixture()
    const provider = new ScriptedProvider([
      { type: 'tool_call', call: { id: 'call-1', name: 'chapter.search', arguments: {} } },
      { type: 'text', text: '查询参数无效，请换一种问法。' },
    ])
    const result = await runAgent({ message: '搜索', history: [], provider, registry: createCompanionToolRegistry(), ...current })
    expect(result.text).toContain('参数无效')
    expect(result.audit[0].errorCode).toBe('InvalidArguments')
  })

  it('stops safely when the model exceeds the tool-step limit', async () => {
    const current = fixture()
    const provider = new ScriptedProvider([
      { type: 'tool_call', call: { id: 'call-1', name: 'work.get_current', arguments: {} } },
      { type: 'tool_call', call: { id: 'call-2', name: 'work.get_current', arguments: {} } },
    ])
    await expect(runAgent({ message: '循环', history: [], provider, registry: createCompanionToolRegistry(), maxToolSteps: 1, ...current })).rejects.toMatchObject({ code: 'AgentStepLimit' } satisfies Partial<AgentRuntimeError>)
  })

  it('normalizes provider failures as ModelError', async () => {
    const current = fixture()
    const provider = new ScriptedProvider([])
    await expect(runAgent({ message: '失败', history: [], provider, registry: createCompanionToolRegistry(), ...current })).rejects.toMatchObject({ code: 'ModelError' } satisfies Partial<AgentRuntimeError>)
  })

  it('keeps string errors returned by the Tauri boundary', async () => {
    const current = fixture()
    const provider: AgentModelProvider = {
      id: 'tauri-error',
      testConnection: async () => 'ok',
      generate: async () => { throw 'MODEL_HTTP_ERROR:400:tool_choice is not supported' },
    }
    await expect(runAgent({ message: '你好', history: [], provider, registry: createCompanionToolRegistry(), ...current }))
      .rejects.toMatchObject({ code: 'ModelError', message: 'MODEL_HTTP_ERROR:400:tool_choice is not supported' } satisfies Partial<AgentRuntimeError>)
  })

  it('cancels an in-flight model turn without waiting for the provider', async () => {
    const current = fixture()
    const controller = new AbortController()
    const provider: AgentModelProvider = {
      id: 'pending',
      testConnection: async () => 'ok',
      generate: () => new Promise(() => undefined),
    }
    const pending = runAgent({ message: '先停一下', history: [], provider, registry: createCompanionToolRegistry(), signal: controller.signal, ...current })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'AgentCancelled' } satisfies Partial<AgentRuntimeError>)
  })
})
