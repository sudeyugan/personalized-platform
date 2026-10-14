import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clickTrustedLogin, hasTrustedLoginClick } from './trusted-login.js'
const job = { origin: 'https://mail.example.com', tabId: 7, cachedLogin: true }, url = `${job.origin}/login`
let api, active, hooks
const event = () => ({ addListener: vi.fn(), removeListener: vi.fn() })
beforeEach(() => {
  hooks = { changed: event(), removed: event(), detached: event() }
  active = vi.fn(async () => {})
  api = {
    permissions: { contains: vi.fn(async () => true), onRemoved: hooks.removed },
    tabs: { get: vi.fn(async () => ({ url, incognito: false })), onUpdated: hooks.changed },
    scripting: { executeScript: vi.fn(async () => [{ result: { status: 'ready', point: { x: 120, y: 200 } } }]) },
    debugger: { attach: vi.fn(async () => {}), detach: vi.fn(async () => {}), sendCommand: vi.fn(async () => {}), onDetach: hooks.detached },
  }
  vi.stubGlobal('chrome', api)
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
describe('trusted login uses a narrow fixed command surface', () => {
  it('is disabled without the optional browser grant, and requires per-task opt-in', async () => {
    api.permissions.contains.mockResolvedValue(false)
    expect(await hasTrustedLoginClick()).toBe(false)
    await expect(clickTrustedLogin(job, url, active)).rejects.toThrow('permission')
    await expect(clickTrustedLogin({ ...job, cachedLogin: false }, url, active)).rejects.toThrow('permission')
    expect(api.debugger.attach).not.toHaveBeenCalled()
    expect(api.debugger.sendCommand).not.toHaveBeenCalled()
  })
  it('only dispatches one button press/release, then detaches; never reads credentials or network', async () => {
    expect(await clickTrustedLogin(job, url, active)).toBe('submitted')
    expect(api.debugger.attach).toHaveBeenCalledExactlyOnceWith({ tabId: 7 }, '1.3')
    expect(api.debugger.sendCommand.mock.calls.map(([, method, params]) => [method, params.type])).toEqual([
      ['Input.dispatchMouseEvent', 'mousePressed'], ['Input.dispatchMouseEvent', 'mouseReleased'],
    ])
    expect(api.scripting.executeScript.mock.calls.map(([request]) => request.args[0])).toEqual(['target', 'validate_target', 'validate_target'])
    expect(active).toHaveBeenCalledTimes(4)
    expect(api.debugger.detach).toHaveBeenCalledExactlyOnceWith({ tabId: 7 })
    expect(JSON.stringify(api.debugger.sendCommand.mock.calls)).not.toMatch(/Runtime|DOM|Network|value|cookie|password|token/)
    for (const hook of Object.values(hooks)) expect(hook.removeListener).toHaveBeenCalledOnce()
  })
  it('never detaches another debugger on an attach conflict', async () => {
    api.debugger.attach.mockRejectedValue(new Error('already attached'))
    await expect(clickTrustedLogin(job, url, active)).rejects.toThrow('already attached')
    expect(api.debugger.detach).not.toHaveBeenCalled(); expect(api.debugger.sendCommand).not.toHaveBeenCalled()
  })
  it.each(['revocation', 'navigation', 'detachment'])('stops before release if %s occurs after press', async cause => {
    api.debugger.sendCommand.mockImplementationOnce(async () => {
      if (cause === 'revocation') hooks.removed.addListener.mock.calls[0][0]()
      if (cause === 'navigation') hooks.changed.addListener.mock.calls[0][0](7, { url: `${job.origin}/other` })
      if (cause === 'detachment') hooks.detached.addListener.mock.calls[0][0]({ tabId: 7 })
    })
    await expect(clickTrustedLogin(job, url, active)).rejects.toThrow('tab_changed')
    expect(api.debugger.sendCommand).toHaveBeenCalledOnce()
    expect(api.debugger.detach).toHaveBeenCalledOnce()
  })
  it('stops on changed, offscreen or masked targets rather than replaying coordinates', async () => {
    for (const result of [{ status: 'changed' }, { status: 'needs_user' }, { status: 'ready', point: { x: NaN, y: 10 } }]) {
      api.scripting.executeScript.mockResolvedValue([{ result }])
      await expect(clickTrustedLogin(job, url, active)).rejects.toThrow('tab_changed')
    }
    expect(api.debugger.sendCommand).not.toHaveBeenCalled()
  })
  it('rejects cancellation, incognito and changed URLs before attachment', async () => {
    active.mockRejectedValueOnce(new Error('permission'))
    await expect(clickTrustedLogin(job, url, active)).rejects.toThrow('permission')
    for (const tab of [{ url, incognito: true }, { url: `${job.origin}/other` }, { url: 'https://other.example.com/login' }]) {
      api.tabs.get.mockResolvedValue(tab)
      await expect(clickTrustedLogin(job, url, active)).rejects.toThrow('tab_changed')
    }
    expect(api.debugger.attach).not.toHaveBeenCalled()
  })
  it('expires a hung attach, cleans up late success, and never sends input', async () => {
    vi.useFakeTimers()
    let finish
    api.debugger.attach.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const pending = clickTrustedLogin(job, url, active), assertion = expect(pending).rejects.toThrow('page_pending')
    await vi.advanceTimersByTimeAsync(6001); await assertion
    finish(); await Promise.resolve(); await Promise.resolve()
    expect(api.debugger.detach).toHaveBeenCalledOnce()
    expect(api.debugger.sendCommand).not.toHaveBeenCalled()
  })
})
