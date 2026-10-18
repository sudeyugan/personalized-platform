import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSeedLibrary } from '../../domain/seed'
import { useLibraryStore } from '../../state/useLibraryStore'
import type { AgentModelProvider, AgentModelRequest, AgentModelResponse } from '../companion/agent/types'
import { generateIdeaRound } from './service'
import { ideaFixture } from './fixtures'
vi.mock('../../infrastructure/libraryRepository', () => ({ libraryRepository: { save: vi.fn(async () => {}) } }))
const response: AgentModelResponse = { type: 'text', text: JSON.stringify(ideaFixture) }
function fixture(seed = '我想推敲一种判断') {
  const state = useLibraryStore.getState(), id = state.createIdea(seed), revision = state.prepareIdeaRound(id, seed, 'explore')
  const generate = vi.fn(async (_request: AgentModelRequest): Promise<AgentModelResponse> => response)
  const provider: AgentModelProvider = { id: 'deepseek-test', testConnection: async () => '', generate }
  const request = { id, revision, signal: new AbortController().signal, requestReview: vi.fn(async () => true) }
  return { generate, provider, request, call: () => generateIdeaRound(request, () => provider) }
}
describe('isolated idea model service', () => {
  beforeEach(() => {
    const data = createSeedLibrary(); data.companion.provider = { providerId: 'deepseek', endpoint: 'https://api.deepseek.com', model: 'test' }
    data.settings.trust.externalAiProcessing = true; data.session.activeView = 'ideas'
    data.companion.messages = [{ id: 'private-chat', role: 'user', content: 'PRIVATE-OTHER-CHAT', createdAt: new Date().toISOString() }]
    data.chapters[data.session.activeChapterId].plainText = 'PRIVATE-CHAPTER'
    useLibraryStore.setState({ data })
  })
  afterEach(() => vi.useRealTimers())
  it('only sends the current idea, minimal time context and zero tools through the existing gateway', async () => {
    const f = fixture(); expect(await f.call()).toEqual(ideaFixture)
    const request = f.generate.mock.calls[0][0], text = JSON.stringify(request)
    expect(request.tools).toEqual([]); expect(request.context.page).toBe('ideas')
    expect(text).toContain('我想推敲一种判断'); expect(text).not.toMatch(/PRIVATE-OTHER-CHAT|PRIVATE-CHAPTER|activeWork|activeChapter/)
    expect(f.request.requestReview).not.toHaveBeenCalled()
  })
  it('keeps prior answers before their subsequent questions and supplies the latest answer last', async () => {
    const f = fixture('一个尚未明确的起点')
    useLibraryStore.getState().completeIdeaRound(f.request.id, f.request.revision, ideaFixture)
    f.request.revision = useLibraryStore.getState().prepareIdeaRound(f.request.id, '我更接近第二个方向，但也有第一种感受', 'explore')
    await f.call()
    const material = f.generate.mock.calls[0][0].messages.find(message => message.role === 'user')!.content
    expect(material.indexOf('【用户此前的表达】')).toBeLessThan(material.indexOf('【随后提出的问题】'))
    expect(material.indexOf(ideaFixture.question)).toBeLessThan(material.lastIndexOf('我更接近第二个方向，但也有第一种感受'))
    expect(material).toContain(`1. ${ideaFixture.options[0]}`)
    expect(material).toContain(`2. ${ideaFixture.options[1]}`)
  })
  it('protects personal details and never sends after a declined review or blocked secret', async () => {
    const f = fixture('我的邮箱 me@example.com 收到一封信，我想梳理一下')
    f.request.requestReview.mockResolvedValue(false)
    await expect(f.call()).rejects.toThrow('取消发送'); expect(f.generate).not.toHaveBeenCalled()
    const secret = fixture('password=abc-PRIVATE-CREDENTIAL-123456')
    await expect(secret.call()).rejects.toThrow(/密钥|密码|令牌/); expect(secret.generate).not.toHaveBeenCalled()
    const multiline = fixture('还有一个边界测试\npassword=abc-PRIVATE-CREDENTIAL-123456')
    await expect(multiline.call()).rejects.toThrow(/密钥|密码|令牌/); expect(multiline.generate).not.toHaveBeenCalled()
  })
  it('rechecks settings and library identity after review, before model dispatch', async () => {
    const f = fixture('我的邮箱 me@example.com 让我有点困惑')
    f.request.requestReview.mockImplementation(async () => { const data = useLibraryStore.getState().data; useLibraryStore.setState({ data: { ...data, settings: { ...data.settings, trust: { ...data.settings.trust, externalAiProcessing: false } } } }); return true })
    await expect(f.call()).rejects.toThrow('设置已变化'); expect(f.generate).not.toHaveBeenCalled()
  })
  it('rejects a restored library with the same IDs/revisions, and a module disabled mid-flight', async () => {
    const restored = fixture()
    restored.generate.mockImplementation(async () => { useLibraryStore.setState({ data: structuredClone(useLibraryStore.getState().data) }); return response })
    await expect(restored.call()).rejects.toThrow('手稿或页面已变化')
    const disabled = fixture()
    disabled.generate.mockImplementation(async () => { useLibraryStore.getState().toggleModule('ideas'); return response })
    await expect(disabled.call()).rejects.toThrow(/页面已变化|设置已变化/)
    expect(useLibraryStore.getState().data.ideas?.sessions[0].turns).toHaveLength(0)
  })
  it('repairs invalid structured output once, and never executes proposed tools', async () => {
    const f = fixture(); f.generate.mockResolvedValueOnce({ type: 'text', text: 'not-json' }).mockResolvedValueOnce(response)
    await expect(f.call()).resolves.toEqual(ideaFixture); expect(f.generate).toHaveBeenCalledTimes(2)
    expect(f.generate.mock.calls.every(([request]) => request.tools.length === 0)).toBe(true)
    const tool = fixture(); tool.generate.mockResolvedValue({ type: 'tool_call', call: { id: 'bad', name: 'system.open', arguments: {} } })
    await expect(tool.call()).rejects.toThrow('没有执行任何工具')
  })
  it('stops promptly on cancellation and ignores late results from stale sessions', async () => {
    const f = fixture(), abort = new AbortController(); f.request.signal = abort.signal
    let resolve!: (value: AgentModelResponse) => void
    f.generate.mockImplementation(() => new Promise(done => { resolve = done }))
    const pending = f.call(); await vi.waitFor(() => expect(f.generate).toHaveBeenCalled())
    abort.abort(); await expect(pending).rejects.toThrow('已暂停'); resolve(response)
    expect(useLibraryStore.getState().data.ideas?.sessions[0].turns).toHaveLength(0)
    const stale = fixture(); stale.generate.mockImplementation(async () => { useLibraryStore.getState().editIdeaDraft(stale.request.id, '本机已改稿'); return response })
    await expect(stale.call()).rejects.toThrow('手稿或页面已变化')
  })
  it('fails closed with external AI disabled, a disabled module, mock configuration or a deadline', async () => {
    const f = fixture(); const data = useLibraryStore.getState().data
    useLibraryStore.setState({ data: { ...data, settings: { ...data.settings, trust: { ...data.settings.trust, externalAiProcessing: false } } } })
    await expect(f.call()).rejects.toThrow(/隐私设置|设置已变化/); expect(f.generate).not.toHaveBeenCalled()
    const live = useLibraryStore.getState().data; useLibraryStore.setState({ data: { ...live, settings: { ...live.settings, trust: { ...live.settings.trust, externalAiProcessing: true } } } })
    const mock = fixture(); useLibraryStore.setState({ data: { ...useLibraryStore.getState().data, companion: { ...useLibraryStore.getState().data.companion, provider: { providerId: 'mock', endpoint: '', model: 'mock' } } } })
    await expect(mock.call()).rejects.toThrow('复用同一份 API 配置')
    const reset = useLibraryStore.getState().data; useLibraryStore.setState({ data: { ...reset, companion: { ...reset.companion, provider: data.companion.provider } } })
    const deadline = fixture(); deadline.generate.mockImplementation(() => new Promise(() => {})); vi.useFakeTimers()
    const result = expect(deadline.call()).rejects.toThrow('超时'); await vi.advanceTimersByTimeAsync(60001); await result
  })
})
