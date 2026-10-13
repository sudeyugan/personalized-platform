import { afterEach, describe, expect, it, vi } from 'vitest'
import { TakeoverRunner } from './runner'
import type { TakeoverDecision } from './model'
import type { TakeoverObservation, TakeoverProgress } from './types'

const observation: TakeoverObservation = { revision: 1, windowTitle: '测试窗口', controls: [{ id: 'e0', name: '搜索', automationId: 'Search', controlType: 50004, canFill: true, canInvoke: false }], truncated: false }
const action: TakeoverDecision = { type: 'action', action: { elementId: 'e0', operation: 'fill', text: '报告' } }
const done: TakeoverDecision = { type: 'result', status: 'observed', evidence: '搜索结果已出现' }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }
function fixture(decisions: TakeoverDecision[] = [action, done]) {
  const progress: TakeoverProgress[] = []
  const native = { begin: vi.fn(async () => 's1'), observe: vi.fn(async () => observation), act: vi.fn(async () => ({ verified: true })), end: vi.fn(async () => undefined) }
  const decide = vi.fn(async () => decisions.shift() ?? done)
  const assertAllowed = vi.fn()
  const runner = new TakeoverRunner({ windowId: 'w1', control: true, native, decide, assertAllowed, progress: value => progress.push(value) })
  return { runner, native, decide, assertAllowed, progress }
}
afterEach(() => vi.restoreAllMocks())
describe('bounded takeover loop', () => {
  it('reports metadata as awaiting user review and does not turn later cleanup into a new failure', async () => {
    const result = vi.fn()
    const f = fixture()
    const runner = new TakeoverRunner({ windowId: 'w1', control: true, native: f.native, decide: f.decide, assertAllowed: f.assertAllowed, progress: () => {}, result })
    await runner.start(); await runner.stop()
    expect(result).toHaveBeenCalledExactlyOnceWith('awaiting_review', 1)
  })
  it('observes, acts once, re-observes, and releases its lease', async () => {
    const f = fixture(); await f.runner.start()
    expect(f.native.act).toHaveBeenCalledExactlyOnceWith('s1', 1, action.type === 'action' ? action.action : {}, false)
    expect(f.native.observe).toHaveBeenCalledTimes(2)
    expect(f.native.end).toHaveBeenCalledWith('s1')
    expect(f.progress.at(-1)?.phase).toBe('finished')
  })
  it('rechecks authority after the model returns', async () => {
    const f = fixture(); let denied = false
    f.assertAllowed.mockImplementation(() => { if (denied) throw new Error('revoked') })
    f.decide.mockImplementation(async () => { denied = true; return action })
    await f.runner.start()
    expect(f.native.act).not.toHaveBeenCalled()
    expect(f.progress.at(-1)?.message).toBe('revoked')
  })
  it('ignores a late model action after stop', async () => {
    const f = fixture(); const response = deferred<TakeoverDecision>()
    f.decide.mockReturnValue(response.promise)
    const work = f.runner.start(); await vi.waitFor(() => expect(f.decide).toHaveBeenCalled())
    await f.runner.stop(); response.resolve(action); await work
    expect(f.native.act).not.toHaveBeenCalled()
    expect(f.progress.at(-1)?.phase).toBe('stopped')
  })
  it('continues only after the paused request settles, using a fresh lease and observation', async () => {
    const f = fixture(); const response = deferred<TakeoverDecision>()
    f.decide.mockReturnValueOnce(response.promise).mockResolvedValue(done)
    const work = f.runner.start(); await vi.waitFor(() => expect(f.decide).toHaveBeenCalled())
    await f.runner.pause(); const resume = f.runner.resume(); response.resolve(action)
    await work; await resume
    expect(f.native.begin).toHaveBeenCalledTimes(2)
    expect(f.native.observe).toHaveBeenCalledTimes(2)
    expect(f.native.act).not.toHaveBeenCalled()
    expect(f.progress.at(-1)?.phase).toBe('finished')
  })
  it('does not retry a possibly dispatched failed write', async () => {
    const f = fixture(); f.native.act.mockRejectedValue(new Error('timeout after dispatch'))
    await f.runner.start()
    expect(f.native.act).toHaveBeenCalledTimes(1)
    expect(f.progress.at(-1)?.phase).toBe('error')
    expect(f.native.end).toHaveBeenCalled()
  })
  it('requires separate confirmation for exactly the pending control', async () => {
    const f = fixture(); f.native.act.mockRejectedValueOnce(new Error('TAKEOVER_ACTION_CONFIRMATION_REQUIRED'))
    await f.runner.start()
    expect(f.progress.at(-1)?.phase).toBe('waiting')
    expect(f.native.end).not.toHaveBeenCalled()
    await f.runner.confirmAction()
    expect(f.native.act.mock.calls[1]).toEqual(['s1', 1, action.type === 'action' ? action.action : {}, true])
    expect(f.native.end).toHaveBeenCalled()
  })
  it('never exceeds eight writes and still observes after the last one', async () => {
    const f = fixture(Array(20).fill(action)); await f.runner.start()
    expect(f.native.act).toHaveBeenCalledTimes(8)
    expect(f.decide).toHaveBeenCalledTimes(8)
    expect(f.native.observe).toHaveBeenCalledTimes(9)
    expect(f.progress.at(-1)?.message).toContain('步骤上限')
  })
  it('expires before applying a late response', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(0); const f = fixture()
    f.decide.mockImplementation(async () => { clock.mockReturnValue(181000); return action })
    await f.runner.start()
    expect(f.native.act).not.toHaveBeenCalled()
    expect(f.progress.at(-1)?.phase).toBe('error')
  })
  it('cannot revive a stopped runner by clicking old continue/confirm controls', async () => {
    const f = fixture(); await f.runner.stop(); await f.runner.resume(); await f.runner.confirmAction()
    expect(f.native.begin).not.toHaveBeenCalled(); expect(f.native.act).not.toHaveBeenCalled()
  })
  it('serializes repeated continue clicks while the previous model request settles', async () => {
    const f = fixture(); const response = deferred<TakeoverDecision>()
    f.decide.mockReturnValueOnce(response.promise).mockResolvedValue(done)
    const work = f.runner.start(); await vi.waitFor(() => expect(f.decide).toHaveBeenCalled())
    await f.runner.pause(); const a = f.runner.resume(); const b = f.runner.resume()
    response.resolve(action); await Promise.all([work, a, b])
    expect(f.native.begin).toHaveBeenCalledTimes(2); expect(f.native.act).not.toHaveBeenCalled()
  })
})
