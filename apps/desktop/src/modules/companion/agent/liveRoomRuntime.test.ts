import { describe, expect, it, vi } from 'vitest'
import { createSeedLibrary } from '../../../domain/seed'
import { createAgentApplicationServices } from './applicationServices'
import { buildAgentAccess, buildAgentContext } from './context'
import { AgentPermissionEngine } from './permission'
import { runAgent } from './runtime'
import { createCompanionToolRegistry } from './tools'
import type { AgentModelProvider } from './types'

const message = '我想看b站天才美少女卡莎的直播间'
const target = 'https://live.bilibili.com/1733394496'
const rooms = [{ title: '顶级瞄准 - 天才美少女卡莎 - 哔哩哔哩直播', url: target, snippet: '' }]

function fixture() {
  const data = createSeedLibrary()
  data.companion.permissions.fullAccess = false
  data.companion.permissions.internet = true
  data.companion.computer.enabled = true
  data.companion.computer.profile = 'trusted_workstation'
  const searchWeb = vi.fn(async () => rooms)
  const execute = vi.fn(async () => ({ opened: true, target, status: 'submitted_to_default_handler' }))
  const provider: AgentModelProvider = {
    id: 'never-call-model', testConnection: async () => 'ok',
    generate: vi.fn(async () => { throw new Error('This explicit flow must not ask the model to invent actions or URLs') }),
  }
  const access = buildAgentAccess(data, [])
  const services = createAgentApplicationServices(data, access, { searchWeb, computer: { execute } })
  const permissions = new AgentPermissionEngine(() => ({
    policy: { autoAllow: ['read'] }, resourcePermissions: data.companion.permissions,
    computer: data.companion.computer, access: buildAgentAccess(data, []),
  }))
  return { data, searchWeb, execute, provider, input: { message, history: [], services, permissions, provider, context: buildAgentContext(data, access), registry: createCompanionToolRegistry() } }
}

describe('natural live room request through the real runtime and permission engine', () => {
  it('runs search → verified target → open without model or persistent tasks', async () => {
    const f = fixture()
    const result = await runAgent(f.input)
    expect(f.searchWeb).toHaveBeenCalledExactlyOnceWith('B站 "天才美少女卡莎" 直播间')
    expect(f.execute).toHaveBeenCalledExactlyOnceWith({ action: 'app_open', params: { target } }, false)
    expect(f.provider.generate).not.toHaveBeenCalled()
    expect(result.audit.map(item => [item.toolName, item.resultStatus])).toEqual([['web.search', 'success'], ['system.open', 'success']])
    expect(result.session.events.map(item => item.type)).toEqual(['context', 'user', 'tool_call', 'tool_result', 'tool_call', 'tool_result', 'assistant'])
    expect(result.text).toContain('不代表页面已加载或主播正在直播')
  })
  it('does not search or open when internet permission is disabled', async () => {
    const f = fixture()
    f.data.companion.permissions.internet = false
    const result = await runAgent(f.input)
    expect(f.searchWeb).not.toHaveBeenCalled()
    expect(f.execute).not.toHaveBeenCalled()
    expect(result.audit).toMatchObject([{ toolName: 'web.search', permissionDecision: 'denied' }])
    expect(result.text).toContain('联网查询未授权')
  })
  it('does not treat full program access as computer permission', async () => {
    const f = fixture()
    f.data.companion.permissions.fullAccess = true
    f.data.companion.computer.enabled = false
    const result = await runAgent(f.input)
    expect(f.execute).not.toHaveBeenCalled()
    expect(result.text).toContain('开启电脑能力')
    expect(result.audit[1].permissionDecision).toBe('denied')
  })
  it('honors an explicit target denial even in trusted workstation mode', async () => {
    const f = fixture()
    f.data.companion.computer.grants = [{ id: 'deny-room', capability: 'applications', targetKind: 'application', target, mode: 'deny', createdAt: new Date().toISOString() }]
    const result = await runAgent(f.input)
    expect(f.execute).not.toHaveBeenCalled()
    expect(result.audit[1].permissionDecision).toBe('denied')
  })
  it('honors standard-mode confirmation and cancellation', async () => {
    for (const approved of [true, false]) {
      const f = fixture()
      f.data.companion.computer.profile = 'standard'
      const requestPermission = vi.fn(async () => approved)
      const result = await runAgent({ ...f.input, requestPermission })
      expect(requestPermission).toHaveBeenCalledOnce()
      expect(f.execute).toHaveBeenCalledTimes(approved ? 1 : 0)
      expect(result.audit[1].confirmed).toBe(approved)
      if (!approved) expect(result.text).toContain('没有打开直播间')
    }
  })
  it('rechecks permission if it is revoked while confirmation is pending', async () => {
    const f = fixture()
    f.data.companion.computer.profile = 'standard'
    const result = await runAgent({ ...f.input, requestPermission: async () => { f.data.companion.computer.enabled = false; return true } })
    expect(f.execute).not.toHaveBeenCalled()
    expect(result.audit[1].permissionDecision).toBe('denied')
  })
  it('does not open after cancellation or a tool step limit', async () => {
    const f = fixture()
    const controller = new AbortController()
    f.searchWeb.mockImplementation(async () => { controller.abort(); return rooms })
    await expect(runAgent({ ...f.input, signal: controller.signal })).rejects.toMatchObject({ code: 'AgentCancelled' })
    expect(f.execute).not.toHaveBeenCalled()
    const limited = fixture()
    const stopped = await runAgent({ ...limited.input, maxToolSteps: 1 })
    expect(stopped.text).toContain('本轮已停止')
    expect(stopped.audit).toHaveLength(1)
    expect(limited.execute).not.toHaveBeenCalled()
  })
  it('stops with a factual error if search fails or Windows rejects opening', async () => {
    const search = fixture()
    search.searchWeb.mockRejectedValue(new Error('WEB_SEARCH_HTTP:tencent:403'))
    const failedSearch = await runAgent(search.input)
    expect(search.searchWeb).toHaveBeenCalledOnce()
    expect(search.execute).not.toHaveBeenCalled()
    expect(failedSearch.text).toContain('没有完成直播间搜索')
    const open = fixture()
    open.execute.mockRejectedValue(new Error('APP_OPEN_FAILED'))
    const failedOpen = await runAgent(open.input)
    expect(failedOpen.text).toContain('没有打开直播间')
    expect(failedOpen.text).not.toContain('已将')
  })
  it('runs the second restricted search only for a successful empty result', async () => {
    const f = fixture()
    f.searchWeb.mockResolvedValueOnce([]).mockResolvedValueOnce(rooms)
    const result = await runAgent(f.input)
    expect(f.searchWeb).toHaveBeenCalledTimes(2)
    expect(f.searchWeb.mock.calls[1]).toEqual(['site:live.bilibili.com "天才美少女卡莎"'])
    expect(f.execute).toHaveBeenCalledOnce()
    expect(result.audit.map(item => item.toolName)).toEqual(['web.search', 'web.search', 'system.open'])
  })
})
