import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createSeedLibrary } from '../../domain/seed'
import { useLibraryStore } from '../../state/useLibraryStore'
import { createRitualServices } from './ritualServices'
import { createLiveCompanionApplicationServices, sendCompanionTurn } from './companionConversation'
import { resolveDirectAction } from './agent/directActions'
import { buildAgentAccess } from './agent/context'
import { createAgentApplicationServices } from './agent/applicationServices'
import { createCompanionToolRegistry } from './agent/tools'
import { AgentPermissionEngine } from './agent/permission'
import { isTaskToolEligible } from './agent/taskActionRegistry'
import { getFortuneSign } from '../fortune/themes'
import { truthQuestions } from '../truth/questions'
import { answerBookAnswers } from '../answer-book/answers'
import type { AgentModelRequest, AgentModelResponse } from './agent/types'

const generate = vi.hoisted(() => vi.fn(async (_request: AgentModelRequest): Promise<AgentModelResponse> => ({ type: 'text', text: '普通聊天回复' })))
vi.mock('../../infrastructure/companionProvider', () => ({ createCompanionProvider: () => ({ id: 'test', generate, testConnection: async () => 'ok' }) }))
vi.mock('../../state/persistence', () => ({ commitLibraryData: (data: unknown, set: (value: unknown) => void) => set({ data }), queueLibrarySave: vi.fn() }))

describe('companion local rituals and capability coverage', () => {
  it('makes local play/pause idempotent and never claims to play or switch an empty player', () => {
    const data = useLibraryStore.getState().data
    const services = createLiveCompanionApplicationServices(data, buildAgentAccess(data, []))
    expect(() => services.controlMusic!('play')).toThrow('尚未选择')
    expect(useLibraryStore.getState().playback.playing).toBe(false)
    data.tracks.push({ id: 'track', title: '本地曲', artist: '作者', fileName: 'test.mp3', mimeType: 'audio/mpeg', size: 1, sha256: '', createdAt: '' })
    data.session.currentTrackId = 'track'
    expect(services.controlMusic!('play')).toMatchObject({ playing: true, player: 'yiyu-local' })
    expect(services.controlMusic!('play')).toMatchObject({ playing: true })
    expect(services.controlMusic!('pause')).toMatchObject({ playing: false })
    expect(services.controlMusic!('pause')).toMatchObject({ playing: false })
    expect(() => services.controlMusic!('next')).toThrow('队列为空')
  })
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-08T12:00:00'))
    useLibraryStore.setState({ data: createSeedLibrary(), temporaryCompanionWorkIds: [], playback: { playing: false, context: 'global', queue: [] } })
    generate.mockClear()
  })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  it.each([
    ['小鱼，帮我抽一根签', 'fortune.draw', { kind: 'daily', guest: false }],
    ['请抽一支恋爱签', 'fortune.draw', { kind: 'love', guest: false }],
    ['替别人抽一根前程签', 'fortune.draw', { kind: 'future', guest: true }],
    ['帮我抽一张真心话', 'truth.draw', {}],
    ['翻开答案之书', 'answer_book.draw', {}],
  ])('routes %s to a real declared action', (message, name, args) => {
    expect(resolveDirectAction(message, createCompanionToolRegistry().definitions())).toMatchObject({ name, arguments: args })
  })

  it.each(['不要抽一根签', '帮我不要抽签', '为什么不能抽签', '我刚才抽了一根签', '帮我抽签然后删除日记', '替张三抽一根签'])('does not mutate for discussion, negation or ambiguous requests: %s', (message) => {
    expect(resolveDirectAction(message, createCompanionToolRegistry().definitions())).toBeUndefined()
  })

  it('draws all themes from the existing bank, reuses today and preserves independent results', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const services = createRitualServices()
    for (const kind of ['daily', 'love', 'future'] as const) {
      const drawn = services.drawFortune!(kind, false)
      expect(drawn).toMatchObject({ kind, date: '2026-10-08', signId: 1, reused: false, guest: false })
      expect(drawn.text).toContain(getFortuneSign(kind, 1)!.poem)
      expect(services.drawFortune!(kind, false)).toMatchObject({ signId: 1, reused: true })
    }
    expect(Object.keys(useLibraryStore.getState().data.fortune!)).toHaveLength(3)
    vi.setSystemTime(new Date('2026-10-09T12:00:00'))
    expect(services.drawFortune!('daily', false)).toMatchObject({ date: '2026-10-09', reused: false })
    expect(useLibraryStore.getState().data.fortune!.love?.date).toBe('2026-10-08')
  })

  it('keeps guest draws out of personal results and uses actual truth/answer banks without saving favorites', () => {
    const services = createRitualServices()
    expect(services.drawFortune!('love', true)).toMatchObject({ guest: true, reused: false })
    expect(useLibraryStore.getState().data.fortune).toBeUndefined()
    const cards = Array.from({ length: truthQuestions.length }, () => services.drawTruth!().text)
    expect(new Set(cards).size).toBe(truthQuestions.length)
    expect(cards.every((card) => truthQuestions.some((question) => card.includes(question)))).toBe(true)
    const answer = services.drawAnswerBook!().text
    expect(answerBookAnswers.some((entry) => answer.includes(entry))).toBe(true)
    expect(useLibraryStore.getState().data.answerBook.favorites).toEqual([])
  })

  it('executes a simple draw without any provider request even when external AI is blocked', async () => {
    const data = useLibraryStore.getState().data
    data.companion.provider.providerId = 'deepseek'
    data.settings.trust.externalAiProcessing = false
    const reply = await sendCompanionTurn('小鱼，帮我抽一根签')
    expect(reply).toContain('为你抽到今日签')
    expect(generate).not.toHaveBeenCalled()
    expect(data.companion.agentAudit).toEqual([])
    expect(useLibraryStore.getState().data.companion.agentAudit.at(-1)).toMatchObject({ toolName: 'fortune.draw', permissionDecision: 'allowed', resultStatus: 'success' })
    expect(useLibraryStore.getState().data.session.agentNavigation).toMatchObject({ destination: 'fortune', section: 'daily' })
  })

  it('does not draw when full access is off, the module is closed, or the user cancels confirmation', async () => {
    const data = useLibraryStore.getState().data
    data.companion.permissions.fullAccess = false
    expect(await sendCompanionTurn('抽一根签')).toContain('完整程序权限')
    data.companion.permissions.fullAccess = true
    data.settings.modules.find((module) => module.id === 'fortune')!.enabled = false
    expect(await sendCompanionTurn('抽一根签')).toContain('功能已关闭')
    data.settings.modules.find((module) => module.id === 'fortune')!.enabled = true
    data.companion.permissions.writePolicy = 'always_ask'
    const confirm = vi.fn(async () => false)
    expect(await sendCompanionTurn('抽一根签', { requestPermission: confirm })).toContain('用户取消')
    expect(confirm).toHaveBeenCalledOnce()
    expect(useLibraryStore.getState().data.fortune).toBeUndefined()
    expect(generate).not.toHaveBeenCalled()
  })

  it('rechecks module/access at execution after the permission popup', async () => {
    useLibraryStore.getState().data.companion.permissions.writePolicy = 'always_ask'
    const reply = await sendCompanionTurn('抽一根签', { requestPermission: async () => {
      useLibraryStore.getState().data.companion.permissions.fullAccess = false
      return true
    } })
    expect(reply).toContain('完整程序权限')
    expect(useLibraryStore.getState().data.fortune).toBeUndefined()
    expect(generate).not.toHaveBeenCalled()
  })

  it('confirms a real draw when always-ask is enabled', async () => {
    useLibraryStore.getState().data.companion.permissions.writePolicy = 'always_ask'
    expect(await sendCompanionTurn('抽一根前程签', { requestPermission: async () => true })).toContain('前程签')
    expect(useLibraryStore.getState().data.fortune?.future).toBeDefined()
  })

  it('uses live resource grants for reads and does not reuse a revoked access snapshot', () => {
    const data = useLibraryStore.getState().data
    const services = createLiveCompanionApplicationServices(data, buildAgentAccess(data, []))
    expect(services.searchCharacters('外婆')).toHaveLength(1)
    useLibraryStore.getState().setCompanionPermissions({ fullAccess: false, records: false })
    expect(services.searchCharacters('外婆')).toEqual([])
  })

  it('keeps a canceled confirmation canceled even if the policy becomes automatic', async () => {
    useLibraryStore.getState().data.companion.permissions.writePolicy = 'always_ask'
    expect(await sendCompanionTurn('抽一根签', { requestPermission: async () => {
      useLibraryStore.getState().setCompanionPermissions({ writePolicy: 'balanced' })
      return false
    } })).toContain('用户取消')
    expect(useLibraryStore.getState().data.fortune).toBeUndefined()
  })

  it('does not let confirmation bypass a newly revoked permission for other app writes', async () => {
    generate.mockResolvedValueOnce({ type: 'tool_call', call: { id: 'create', name: 'todo.create', arguments: { title: '不应写入' } } })
    useLibraryStore.getState().data.companion.permissions.writePolicy = 'always_ask'
    await sendCompanionTurn('帮我创建一个待办', { requestPermission: async () => {
      useLibraryStore.getState().setCompanionPermissions({ fullAccess: false, todos: false, writeActions: false })
      return true
    } })
    expect(useLibraryStore.getState().data.planner.todos.some((todo) => todo.title === '不应写入')).toBe(false)
    expect(useLibraryStore.getState().data.companion.agentAudit.at(-1)).toMatchObject({ toolName: 'todo.create', permissionDecision: 'denied', errorCode: 'PermissionDenied' })
  })

  it('keeps local ritual turns out of future model history and generic AI-replanned tasks', async () => {
    useLibraryStore.getState().data.settings.trust.retainConversationHistory = true
    useLibraryStore.getState().data.settings.trust.shareRecentConversation = true
    await sendCompanionTurn('抽一根恋爱签')
    expect(useLibraryStore.getState().data.companion.messages.every((message) => message.localOnly)).toBe(true)
    await sendCompanionTurn('你好')
    const requests = generate.mock.calls as unknown as Array<[{ messages: Array<{ content: string }> }]>
    expect(requests[0][0].messages.some((message) => message.content.includes('为你抽到恋爱签'))).toBe(false)
    expect(requests[0][0].messages.some((message) => message.content === '抽一根恋爱签')).toBe(false)
    for (const name of ['fortune.draw', 'truth.draw', 'answer_book.draw']) expect(isTaskToolEligible(createCompanionToolRegistry().lookup(name)!.definition)).toBe(false)
  })

  it('lists actual write/control tools and marks disabled modules without granting permissions', async () => {
    const data = useLibraryStore.getState().data
    data.settings.modules.find((module) => module.id === 'fortune')!.enabled = false
    const access = buildAgentAccess(data, [])
    const registry = createCompanionToolRegistry()
    const result = await registry.execute({ id: 'capabilities', name: 'app.capabilities', arguments: {} }, createAgentApplicationServices(data, access))
    const features = result.data as Array<{ id: string; enabled: boolean; tools: string[] }>
    expect(features).toHaveLength(16)
    expect(features.find((feature) => feature.id === 'fortune')).toMatchObject({ enabled: false, tools: ['fortune.draw'] })
    expect(features.find((feature) => feature.id === 'todos')!.tools).toEqual(expect.arrayContaining(['todo.create', 'todo.update']))
    expect(features.find((feature) => feature.id === 'music')!.tools).toContain('music.control')
    const listed = features.flatMap((feature) => feature.tools)
    for (const tool of registry.definitions().filter((tool) => /^(?:work|chapter|record|character|place|timeline|todo|calendar|course|diary|mood|daily_question|experience|asset|music|fortune|truth|answer_book)\./.test(tool.name))) expect(listed).toContain(tool.name)
    const permissions = new AgentPermissionEngine({ policy: { autoAllow: ['read', 'presentation'] }, resourcePermissions: data.companion.permissions, access, modules: data.settings.modules })
    expect(permissions.check(registry.lookup('app.open')!.definition, { destination: 'fortune' })).toMatchObject({ allowed: false })
    expect(permissions.check(registry.lookup('fortune.draw')!.definition, {})).toMatchObject({ allowed: false })
    await expect(registry.execute({ id: 'invalid', name: 'fortune.draw', arguments: { kind: 'delete', guest: 'true' } }, createAgentApplicationServices(data, access))).resolves.toMatchObject({ success: false, error: { code: 'InvalidArguments' } })
  })
})
