import { describe, expect, it, vi } from 'vitest'
import { createSeedLibrary } from '../../../domain/seed'
import type { AgentApplicationServices } from './applicationServices'
import { buildAgentAccess } from './context'
import { AgentPermissionEngine } from './permission'
import { TaskActionConfirmationRequired, TaskActionRegistry } from './taskActionRegistry'
import { createAgentTaskFromDraft } from './taskPlan'
import { AgentToolRegistry } from './toolRegistry'
import { createCompanionToolRegistry } from './tools'

const objectSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'string' as const, minLength: 1 },
    label: { type: 'string' as const },
  },
  required: ['id'],
  additionalProperties: false,
}

function permissionEngine() {
  const data = createSeedLibrary()
  data.companion.permissions.writeActions = true
  data.companion.permissions.writePolicy = 'balanced'
  return new AgentPermissionEngine({
    policy: { autoAllow: ['read', 'presentation'] },
    resourcePermissions: data.companion.permissions,
    computer: data.companion.computer,
    access: buildAgentAccess(data, []),
  })
}

function taskRegistry(tools: AgentToolRegistry) {
  return new TaskActionRegistry(
    tools,
    permissionEngine(),
    {} as AgentApplicationServices,
    'task-test',
    vi.fn(),
  )
}

describe('TaskActionRegistry', () => {
  it('blocks closed-module navigation in a task even with a previous confirmation', async () => {
    const data = createSeedLibrary()
    data.settings.modules.find((module) => module.id === 'fortune')!.enabled = false
    const openDestination = vi.fn()
    const task = createAgentTaskFromDraft({ title: '页面', goal: '抽签页', steps: [{ title: '打开', action: 'app.open', destination: 'fortune' }] })
    const actions = new TaskActionRegistry(createCompanionToolRegistry(), new AgentPermissionEngine({ policy: { autoAllow: ['read', 'presentation'] }, resourcePermissions: data.companion.permissions, access: buildAgentAccess(data, []), modules: data.settings.modules }), { openDestination } as unknown as AgentApplicationServices, task.id, vi.fn())
    await expect(actions.execute({ ...task.steps[0], confirmed: true, toolName: 'app.open', arguments: { destination: 'fortune' } }, task, 0)).rejects.toThrow('功能已关闭')
    expect(openDestination).not.toHaveBeenCalled()
  })
  it('executes eligible tools and resolves persisted step results', async () => {
    const first = vi.fn((args: Record<string, unknown>) => ({ id: args.id, nested: { count: 2 } }))
    const second = vi.fn((args: Record<string, unknown>) => args)
    const tools = new AgentToolRegistry()
      .register({
        definition: { name: 'test.first', description: 'first', inputSchema: objectSchema, capability: 'read', risk: 'read_only', scope: 'none' },
        execute: first,
      })
      .register({
        definition: { name: 'test.second', description: 'second', inputSchema: objectSchema, capability: 'read', risk: 'read_only', scope: 'none' },
        execute: second,
      })
    const task = createAgentTaskFromDraft({
      title: '引用结果',
      goal: '把前一步结果交给下一步',
      steps: [
        { title: '生成', action: 'tool.call', toolName: 'test.first', arguments: { id: 'item-1' } },
        { title: '复用', action: 'tool.call', toolName: 'test.second', arguments: { id: '{{last.id}}', label: '来源 {{steps.0.id}}' } },
      ],
    }, new Date('2026-09-28T08:00:00.000Z'), new Set(['test.first', 'test.second']))
    const actions = taskRegistry(tools)
    task.steps[0].result = await actions.execute(task.steps[0], task, 0)
    const result = await actions.execute(task.steps[1], task, 1)
    expect(result).toEqual({ id: 'item-1', label: '来源 item-1' })
    expect(first).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledWith(
      { id: 'item-1', label: '来源 item-1' },
      expect.anything(),
      { confirmed: false },
    )
  })

  it('pauses medium-risk writes until this exact step is confirmed', async () => {
    const execute = vi.fn((_args: Record<string, unknown>, _services: AgentApplicationServices, context: { confirmed: boolean }) => context)
    const tools = new AgentToolRegistry().register({
      definition: { name: 'test.write', description: 'write', inputSchema: objectSchema, capability: 'modify', risk: 'medium', scope: 'none' },
      execute,
    })
    const task = createAgentTaskFromDraft({
      title: '确认写入',
      goal: '安全写入',
      steps: [{ title: '写入', action: 'tool.call', toolName: 'test.write', arguments: { id: 'item-1' } }],
    }, new Date(), new Set(['test.write']))
    const actions = taskRegistry(tools)
    await expect(actions.execute(task.steps[0], task, 0)).rejects.toBeInstanceOf(TaskActionConfirmationRequired)
    expect(execute).not.toHaveBeenCalled()
    task.steps[0].confirmed = true
    await expect(actions.execute(task.steps[0], task, 0)).resolves.toEqual({ confirmed: true })
  })

  it('does not let a prior confirmation bypass a hard denial', async () => {
    const execute = vi.fn()
    const tools = new AgentToolRegistry().register({
      definition: { name: 'test.system', description: 'system', inputSchema: objectSchema, capability: 'system', risk: 'high', scope: 'none' },
      execute,
    })
    const task = createAgentTaskFromDraft({
      title: '禁止系统动作',
      goal: '确认不能越权',
      steps: [{ title: '系统动作', action: 'tool.call', toolName: 'test.system', arguments: { id: 'item-1' } }],
    }, new Date(), new Set(['test.system']))
    task.steps[0].confirmed = true
    await expect(taskRegistry(tools).execute(task.steps[0], task, 0)).rejects.toThrow('不向伙伴开放')
    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects unavailable and recursively reserved task tools', () => {
    expect(() => createAgentTaskFromDraft({
      title: '不可用',
      goal: '测试',
      steps: [{ title: '递归', action: 'tool.call', toolName: 'task.create', arguments: {} }],
    }, new Date(), new Set(['test.first']))).toThrow('不可加入任务')
  })
})
