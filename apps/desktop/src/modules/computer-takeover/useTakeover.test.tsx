import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSeedLibrary } from '../../domain/seed'
import { useLibraryStore } from '../../state/useLibraryStore'
import { learned } from '../../domain/operations/fixtures'
import { useTakeover } from './useTakeover'
import type { NativeTakeoverRequest } from './service'
import type { AgentModelResponse } from '../companion/agent/types'

const mocks = vi.hoisted(() => ({ native: vi.fn(), generate: vi.fn() }))
vi.mock('./service', () => ({ takeoverNative: mocks.native }))
vi.mock('../../infrastructure/companionProvider', () => ({ createCompanionProvider: () => ({ id: 'deepseek', generate: mocks.generate, testConnection: async () => 'ok' }) }))
// These tests isolate ownership/cancellation, not the independently tested Egress gateway.
vi.mock('../privacy', () => ({ createPrivacyProtectedProvider: (provider: unknown) => provider }))
vi.mock('./audit', () => ({ createTakeoverAudit: () => (_operation: string, _confirmed: boolean, execute: () => Promise<unknown>) => execute() }))
const done: AgentModelResponse = { type: 'tool_call', call: { id: 'done', name: 'takeover.result', arguments: { status: 'observed', evidence: '虚构窗口观察结束' } } }
const action: AgentModelResponse = { type: 'tool_call', call: { id: 'act', name: 'takeover.act', arguments: { elementId: 'e1', operation: 'fill', text: '报告' } } }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }
beforeEach(() => {
  mocks.native.mockReset(); mocks.generate.mockReset().mockResolvedValue(done)
  const data = createSeedLibrary(); data.companion.computer.enabled = true; data.companion.provider.providerId = 'deepseek'; data.settings.trust.externalAiProcessing = true
  data.settings.modules = data.settings.modules.map(module => module.id === 'companion' ? { ...module, enabled: true, available: true } : module)
  useLibraryStore.setState({ data })
  mocks.native.mockImplementation(async (request: NativeTakeoverRequest) => {
    if (request.action === 'begin') return { sessionId: 's1' }
    if (request.action === 'observe') return { revision: 1, windowTitle: '虚构窗口', controls: [{ id: 'e1', name: '搜索', automationId: 'Search', controlType: 50004, canFill: true, canInvoke: false }], truncated: false }
    return { verified: true }
  })
})
const count = (action: string) => mocks.native.mock.calls.filter(call => call[0].action === action).length
describe('single main-window takeover owner', () => {
  it('uses a parameterized window method, records no evidence text, and stops when its revision changes', async () => {
    const data = useLibraryStore.getState().data; data.companion.operations = [learned({ scope: 'window' })]
    const reply = deferred<AgentModelResponse>(); mocks.generate.mockReturnValueOnce(reply.promise)
    const hook = renderHook(useTakeover); let work!: Promise<void>
    act(() => { work = hook.result.current.start('w1', '查询', true, true, { id: 'operation-test', revision: 1, parameters: { 关键词: '报告' } }) })
    await waitFor(() => expect(mocks.generate).toHaveBeenCalled())
    expect(JSON.stringify(mocks.generate.mock.calls[0][0])).toContain('报告')
    await act(async () => { data.companion.operations![0].revision = 2; reply.resolve(action); await work })
    expect(count('act')).toBe(0)
    expect(hook.result.current.progress.phase).toBe('error')
    expect(data.companion.operations![0].runs).toEqual([])
  })
  it('rejects duplicate starts without replacing the running owner', async () => {
    const gate = deferred<{ sessionId: string }>(); mocks.native.mockImplementationOnce(() => gate.promise)
    const hook = renderHook(useTakeover); let work!: Promise<void>
    act(() => { work = hook.result.current.start('w1', '查找报告', true, true) })
    await expect(hook.result.current.start('w1', '重复目标', true, true)).rejects.toThrow('不要重复')
    await waitFor(() => expect(count('begin')).toBe(1))
    await act(async () => { gate.resolve({ sessionId: 's1' }); await work })
    expect(count('begin')).toBe(1); expect(hook.result.current.progress.phase).toBe('finished')
  })
  it('stopping while begin is in flight cleans its late lease without model calls', async () => {
    const gate = deferred<{ sessionId: string }>(); mocks.native.mockImplementationOnce(() => gate.promise)
    const hook = renderHook(useTakeover); let work!: Promise<void>
    act(() => { work = hook.result.current.start('w1', '查找报告', true, true) })
    await waitFor(() => expect(count('begin')).toBe(1))
    await act(async () => { await hook.result.current.stop(); gate.resolve({ sessionId: 's1' }); await work })
    expect(mocks.generate).not.toHaveBeenCalled(); expect(count('act')).toBe(0); expect(count('end')).toBe(1)
    expect(hook.result.current.progress.phase).toBe('stopped')
  })
  it('closing during previous-session cleanup cancels the queued new start', async () => {
    const reply = deferred<AgentModelResponse>(); mocks.generate.mockReturnValueOnce(reply.promise)
    const hook = renderHook(useTakeover); let old!: Promise<void>
    act(() => { old = hook.result.current.start('w1', '旧目标', true, true) })
    await waitFor(() => expect(mocks.generate).toHaveBeenCalled())
    const end = deferred<unknown>(); const original = mocks.native.getMockImplementation()!
    mocks.native.mockImplementation((request: NativeTakeoverRequest) => request.action === 'end' ? end.promise : original(request))
    const rejected = expect(hook.result.current.start('w2', '新目标', true, true)).rejects.toThrow('启动已取消')
    await waitFor(() => expect(count('end')).toBe(1))
    await act(async () => { await hook.result.current.stop(); end.resolve({}); reply.resolve(action); await old; await rejected })
    expect(count('begin')).toBe(1); expect(count('act')).toBe(0)
  })
  it('revoked computer permission ignores a late proposed fill', async () => {
    const reply = deferred<AgentModelResponse>(); mocks.generate.mockReturnValueOnce(reply.promise)
    const hook = renderHook(useTakeover); let work!: Promise<void>
    act(() => { work = hook.result.current.start('w1', '查找报告', true, true) })
    await waitFor(() => expect(mocks.generate).toHaveBeenCalled())
    await act(async () => {
      const data = useLibraryStore.getState().data
      useLibraryStore.setState({ data: { ...data, companion: { ...data.companion, computer: { ...data.companion.computer, enabled: false } } } })
    })
    await act(async () => { reply.resolve(action); await work })
    expect(count('act')).toBe(0); expect(hook.result.current.progress.phase).toBe('stopped')
  })
  it('a duplicate continue click cannot discard the owner of the resumed loop', async () => {
    const first = deferred<AgentModelResponse>(); const second = deferred<AgentModelResponse>()
    mocks.generate.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const hook = renderHook(useTakeover); let old!: Promise<void>; let resumed!: Promise<void> | undefined
    act(() => { old = hook.result.current.start('w1', '查找报告', true, true) })
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(1))
    await act(async () => { await hook.result.current.pause() })
    act(() => { resumed = hook.result.current.resume(); first.resolve(action) })
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(2))
    await act(async () => { await hook.result.current.resume(); await hook.result.current.stop(); second.resolve(action); await old; await resumed })
    expect(count('begin')).toBe(2); expect(count('end')).toBe(2); expect(count('act')).toBe(0)
  })
})
