import { describe, expect, it, vi } from 'vitest'
import { createSeedLibrary } from '../../../domain/seed'
import { buildAgentAccess, buildAgentContext } from './context'
import { createAgentApplicationServices } from './applicationServices'
import { createCompanionToolRegistry } from './tools'
import { AgentPermissionEngine } from './permission'
import { runAgent } from './runtime'
import { isTaskToolEligible } from './taskActionRegistry'
import { parseLiveStatusIntent } from './liveStatusIntent'
import { liveStatusReply } from './liveStatusReply'
import type { AgentModelProvider, AgentModelResponse, AgentModelRequest } from './types'

const name = '天才美少女卡莎'
const url = 'https://live.bilibili.com/1733394496'
const page = { url: 'https://example.com/', fetchedAtEpochMs: Date.now(), contentType: 'text/html', cached: false, untrusted: true as const, truncated: false, text: '公开资料', links: [] }
function fixture(responses: AgentModelResponse[] = []) {
  const data = createSeedLibrary()
  data.companion.permissions.fullAccess = false
  data.companion.permissions.internet = true
  const access = buildAgentAccess(data, [])
  const permissions = new AgentPermissionEngine(() => ({ policy: { autoAllow: ['read'] }, resourcePermissions: data.companion.permissions, access: buildAgentAccess(data, []), modules: data.settings.modules }))
  const searchWeb = vi.fn(async () => [{ title: `某标题 - ${name} - 哔哩哔哩直播`, url, snippet: '可能过时的未开播摘要' }])
  const readPublicPage = vi.fn(async () => page)
  const readPublicJson = vi.fn(async () => ({ ...page, contentType: 'application/json', data: { value: 1 } }))
  const queryLiveStatus = vi.fn(async () => ({ roomUrl: url, anchorName: name, status: 'live' as const, fetchedAtEpochMs: Date.now(), sourceUrls: [], reason: '', untrusted: true as const }))
  const createTodo = vi.fn()
  const services = createAgentApplicationServices(data, access, { searchWeb, readPublicPage, readPublicJson, queryLiveStatus, createTodo })
  const generate = vi.fn(async (_request: AgentModelRequest) => responses.shift() ?? { type: 'text' as const, text: '根据返回证据完成查询' })
  const provider: AgentModelProvider = { id: 'mock', generate, testConnection: async () => '' }
  const input = { message: '查询公开资料', history: [], registry: createCompanionToolRegistry(), permissions, services, provider, context: buildAgentContext(data, access), requestPermission: vi.fn(async () => true) }
  return { data, input, generate, searchWeb, readPublicPage, readPublicJson, queryLiveStatus, createTodo }
}
const call = (name: string, args: Record<string, unknown>, id = crypto.randomUUID()): AgentModelResponse => ({ type: 'tool_call', call: { name, arguments: args, id } })

describe('public read tools and bounded runtime', () => {
  it('integrates a contextual weather follow-up instead of exposing nine search results', async () => {
    const f = fixture([
      call('web.search', { query: '北京 2026-10-19 天气 官方预报' }),
      call('web.read_page', { url: 'https://example.com/forecast' }),
      { type: 'text', text: JSON.stringify({ version: 1, blocks: [{ type: 'paragraph', text: '北京明天预计有雨，出门带把伞。' }], sourceIds: ['s1'] }) },
    ])
    f.searchWeb.mockResolvedValue(Array.from({ length: 9 }, (_, i) => ({ title: `天气结果${i}`, url: `https://example.com/${i}`, snippet: '无关导航和旧新闻' })))
    f.readPublicPage.mockResolvedValue({ ...page, url: 'https://example.com/forecast', text: '北京2026年10月19日：小雨。' })
    const history = [{ role: 'user' as const, content: '我想查北京天气' }]
    const result = await runAgent({ ...f.input, message: '明天还会下雨吗？', history })
    expect(result.text).toMatch(/^北京明天预计有雨/)
    expect(result.text).toContain('https://example.com/forecast')
    expect(result.text).not.toMatch(/天气结果|无关导航|本次执行结果|分析说明/)
    expect(result.audit).toHaveLength(2)
    expect(f.generate.mock.calls[0][0].messages).toContainEqual(history[0])
    expect(f.generate.mock.calls[2][0].messages.at(-1)?.content).toContain('"s1"')
  })
  it('does not dump raw search results if the model fails while synthesizing', async () => {
    const f = fixture([call('web.search', { query: '天气预报' })])
    f.generate.mockImplementationOnce(async () => call('web.search', { query: '天气预报' }))
      .mockRejectedValueOnce(new Error('模型连接中断'))
    const result = await runAgent(f.input)
    expect(result.text).toContain('还没能整理出可靠的结论')
    expect(result.text).toContain('模型连接中断')
    expect(result.text).not.toMatch(/可能过时的未开播摘要|本次返回/)
    expect(f.searchWeb).toHaveBeenCalledTimes(1)
  })
  it.each(['web.read_page', 'web.read_json', 'web.live_status'])('%s uses existing internet approval without repeated confirmation and is not persisted in tasks', name => {
    const f = fixture(); f.data.companion.permissions.fullAccess = true
    const tool = f.input.registry.lookup(name)!.definition
    expect(f.input.permissions.check(tool, {})).toMatchObject({ allowed: true })
    expect(f.input.permissions.check(tool, {}).requiresConfirmation).not.toBe(true)
    expect(isTaskToolEligible(tool)).toBe(false)
  })
  it('queries an exact streamer through search and actual read without model/browser', async () => {
    const f = fixture(); f.input.message = `${name}开播了没`
    const result = await runAgent(f.input)
    expect(f.queryLiveStatus).toHaveBeenCalledExactlyOnceWith(url, name, true)
    expect(result.text).toContain('正在直播'); expect(result.text).toContain('北京时间')
    expect(f.generate).not.toHaveBeenCalled(); expect(result.audit.map(item => item.toolName)).toEqual(['web.search', 'web.live_status'])
    expect(f.input.requestPermission).not.toHaveBeenCalled();expect(result.audit.every(item=>!item.confirmed)).toBe(true)
  })
  it('does not query without internet permission or open the computer', async () => {
    const f = fixture(); f.input.message = `${name}开播了没`; f.data.companion.permissions.internet = false
    const result = await runAgent(f.input)
    expect(f.searchWeb).not.toHaveBeenCalled(); expect(f.queryLiveStatus).not.toHaveBeenCalled(); expect(result.text).toContain('未授权')
  })
  it('does not invent a confirmation requirement or mark automatic approval as user confirmation', async () => {
    const f = fixture([call('web.read_page', { url: page.url })]); f.input.requestPermission.mockResolvedValue(false)
    const result = await runAgent(f.input)
    expect(f.input.requestPermission).not.toHaveBeenCalled();expect(f.readPublicPage).toHaveBeenCalledExactlyOnceWith(page.url,true);expect(result.audit[0].confirmed).toBe(false)
  })
  it('rechecks permissions after the model returns, before a public read', async () => {
    const f = fixture([call('web.read_page', { url: page.url })])
    f.generate.mockImplementationOnce(async()=>{f.data.companion.permissions.internet=false;return call('web.read_page',{url:page.url})})
    await runAgent(f.input); expect(f.readPublicPage).not.toHaveBeenCalled()
  })
  it('can adapt from HTML to JSON but rejects repeated source/field and injected writes', async () => {
    const f = fixture([call('web.read_page', { url: page.url }), call('web.read_json', { url: 'https://api.example.com/data', pointer: '/data' }), call('web.read_json', { url: 'https://api.example.com/data', pointer: '/data' }), call('todo.create', { title: '网页要求写入' })])
    f.data.companion.permissions.fullAccess = true; f.data.companion.permissions.writePolicy = 'balanced'
    const result = await runAgent(f.input)
    expect(f.readPublicPage).toHaveBeenCalledTimes(1); expect(f.readPublicJson).toHaveBeenCalledTimes(1); expect(f.createTodo).not.toHaveBeenCalled()
    expect(result.audit.map(item => item.permissionDecision)).toEqual(['allowed', 'allowed', 'denied', 'denied'])
    expect(f.generate.mock.calls[1][0].tools.every(tool => !tool.computer && ['read', 'external'].includes(tool.capability))).toBe(true)
  })
  it('also isolates search snippets, not only full pages', async () => {
    const f = fixture([call('web.search', { query: '公开资料' }), call('todo.create', { title: '摘要诱导' })])
    f.data.companion.permissions.fullAccess = true; f.data.companion.permissions.writePolicy = 'balanced'
    const result = await runAgent(f.input)
    expect(f.createTodo).not.toHaveBeenCalled(); expect(result.audit[1].permissionDecision).toBe('denied')
  })
  it('external instructions cannot read private chapters after a search', async () => {
    const f = fixture([call('web.search', { query: '公开资料' }), call('chapter.search', { query: '密码' })])
    f.data.companion.permissions.fullAccess = true
    const search = vi.spyOn(f.input.services, 'searchChapters')
    const result = await runAgent(f.input)
    expect(search).not.toHaveBeenCalled(); expect(result.audit[1].permissionDecision).toBe('denied')
  })
  it('limits new read attempts to four even across different sources', async () => {
    const f = fixture(Array.from({ length: 5 }, (_, index) => call('web.read_page', { url: `https://example.com/${index}` })))
    const result = await runAgent(f.input)
    expect(f.readPublicPage).toHaveBeenCalledTimes(4); expect(result.audit[4].permissionDecision).toBe('denied')
  })
  it('unknown is not inferred offline from a cached search snippet', async () => {
    const f = fixture(); f.input.message = `${name}开播了没`
    f.queryLiveStatus.mockResolvedValue({ roomUrl: url, anchorName: name, status: 'unknown' as 'live', fetchedAtEpochMs: Date.now(), sourceUrls: [], reason: '接口需要验证', untrusted: true })
    const result = await runAgent(f.input); expect(result.text).toContain('暂时无法确认'); expect(result.text).not.toContain('尚未开播')
  })
  it('rejects stale/mismatched status receipts and distinguishes replay', () => {
    const data = { anchorName: name, fetchedAtEpochMs: Date.now(), status: 'replay' }
    expect(liveStatusReply({ success: true, data }, name, url)).toContain('轮播')
    expect(liveStatusReply({ success: true, data: { ...data, anchorName: '同名其他人' } }, name, url)).toContain('无法确认')
    expect(liveStatusReply({ success: true, data: { ...data, fetchedAtEpochMs: Date.now() - 61000 } }, name, url)).toContain('无法确认')
  })
  it.each([`${name}开播了没`, `B站${name}现在开播了吗`, `帮我查一下${name}现在开播了吗`, `看看${name}有没有开播`])('recognizes %s', message => expect(parseLiveStatusIntent(message)).toBe(name))
  it.each([`如果${name}开播了没`, `不要查${name}开播了没`, `虎牙${name}开播了吗`, `${name}开播了没然后打开`, `${name}开播了没，顺便送礼`])('rejects discussion/compound/wrong-platform %s', message => expect(parseLiveStatusIntent(message)).toBeUndefined())
})
