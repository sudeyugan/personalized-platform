import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { browserNative, configureBrowser } from './native'
import { browserNativeError } from './nativeError'
import { AgentToolRegistry } from '../companion/agent/toolRegistry'
import { createBrowserTools } from './agentTools'
import { followedLiveReply } from './followedReply'
import type { AgentApplicationServices } from '../companion/agent/applicationServices'

const native = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: native.invoke }))
beforeEach(() => { native.invoke.mockReset(); vi.stubGlobal('__TAURI_INTERNALS__', {}) })
afterEach(() => vi.unstubAllGlobals())

describe('actual Tauri string rejection boundary', () => {
  it.each([
    ['BROWSER_NOT_CONNECTED', '尚未连接Edge扩展'],
    ['BROWSER_OFFLINE', '不在线'],
    ['BROWSER_SITE_PERMISSION', '不必重复填写域名'],
    ['BROWSER_UPDATE_REQUIRED', '重新加载一次'],
    ['BROWSER_LOGIN', '未登录或登录已失效'],
    ['BROWSER_TIMEOUT', '超时'],
    ['BROWSER_RESULT', '未通过校验'],
    ['BROWSER_READ_FAILED', '没有返回可用结果'],
    ['BROWSER_PAGE_PENDING', '尚未加载完成'],
    ['BROWSER_PAGE_OPEN', '未能'],
    ['BROWSER_PAGE_ACCESS', '未允许读取'],
    ['BROWSER_CANCELLED', '已停止'],
  ])('carries %s through native → registry → local reply without leaking raw text', async (code, expected) => {
    native.invoke.mockRejectedValue(`${code}:PRIVATE-NATIVE-DETAIL sk-secret-fixture`)
    const registry = new AgentToolRegistry().registerAll(createBrowserTools())
    const services = { browserRead: () => browserNative('browser_bridge_request') } as unknown as AgentApplicationServices
    const result = await registry.execute({ id: 'fixture', name: 'browser.followed_live', arguments: {} }, services)
    const reply = followedLiveReply(result)
    expect(result.success).toBe(false); expect(reply).toContain(expected)
    expect(reply).not.toContain('工具执行失败'); expect(reply).not.toContain('PRIVATE-NATIVE'); expect(reply).not.toContain('sk-secret')
    expect(reply).toContain('不能据此判断')
  })
  it('recovers the configure queue after a native string error', async () => {
    native.invoke.mockRejectedValueOnce('BROWSER_PORT:PRIVATE-DETAIL').mockResolvedValueOnce({ epoch: 4 })
    await expect(configureBrowser(true, [])).rejects.toThrow('端口')
    await expect(configureBrowser(true, [])).resolves.toEqual({ epoch: 4 })
  })
  it('serializes policy invalidation before configure instead of canceling a later settings request',async()=>{
    native.invoke.mockResolvedValue({epoch:4});await configureBrowser(true,['https://example.com'],true)
    expect(native.invoke.mock.calls.map(([name])=>name)).toEqual(['browser_bridge_cancel','browser_bridge_configure'])
  })
  it('normalizes native Error objects and hides unexpected rejection shapes and bodies', () => {
    expect(browserNativeError(new Error('BROWSER_AUTH:PRIVATE')).message).toContain('连接已失效')
    for (const reason of ['PRIVATE-BODY', { message: 'PRIVATE-ACCOUNT' }, null, 'BROWSER_UNKNOWN:PRIVATE']) {
      expect(browserNativeError(reason).message).toContain('调用失败')
      expect(browserNativeError(reason).message).not.toContain('PRIVATE')
    }
  })
  it('does not mislabel generic mailbox or page failures as livestream status',()=>{
    for(const code of ['BROWSER_TIMEOUT','BROWSER_READ_FAILED','BROWSER_SITE_PERMISSION'])expect(browserNativeError(`${code}:PRIVATE`).message).not.toMatch(/开播状态|连接B站/)
  })
})
