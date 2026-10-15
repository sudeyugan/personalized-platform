import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSeedLibrary } from '../../../domain/seed'
import { createPublicReadServices } from './publicReadServices'
import { publicReadUrl } from '../../../infrastructure/publicWeb'

const mocks = vi.hoisted(() => ({ state: {} as { data: ReturnType<typeof createSeedLibrary> }, invoke: vi.fn(), protect: vi.fn() }))
vi.mock('../../../state/useLibraryStore', () => ({ useLibraryStore: { getState: () => mocks.state } }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))
vi.mock('../../privacy', () => ({ protectOutboundText: mocks.protect }))

beforeEach(() => {
  mocks.state.data = createSeedLibrary(); mocks.state.data.companion.permissions.fullAccess = false; mocks.state.data.companion.permissions.internet = true
  mocks.invoke.mockReset().mockResolvedValue({}); mocks.protect.mockReset().mockImplementation(async value => value)
})
describe('public request authority and protected egress', () => {
  it('requires permission-engine approval and existing internet authority', async () => {
    await expect(createPublicReadServices().readPublicPage!('https://example.com', false)).rejects.toThrow('未授权')
    mocks.state.data.companion.permissions.internet = false
    await expect(createPublicReadServices().readPublicPage!('https://example.com', true)).rejects.toThrow('授权已关闭')
    expect(mocks.invoke).not.toHaveBeenCalled()
  })
  it('uses the real gateway without repeated strict-mode prompts and still blocks private URL data', async () => {
    const {protectOutboundText}=await import('../../privacy/egressGateway')
    mocks.protect.mockImplementation(protectOutboundText)
    mocks.state.data.settings.trust.outboundReviewMode='strict'
    const review=vi.fn(async()=>true)
    await createPublicReadServices(review).readPublicPage!('https://example.com/public',true)
    expect(review).not.toHaveBeenCalled();expect(mocks.invoke).toHaveBeenCalledOnce()
    mocks.invoke.mockClear();mocks.state.data.settings.trust.privateDictionary=[{id:'fixture',value:'private-fixture',category:'person',enabled:true}]
    await expect(createPublicReadServices(review).readPublicPage!('https://example.com/private-fixture',true)).rejects.toThrow('已停止读取')
    expect(mocks.invoke).not.toHaveBeenCalled();expect(review).not.toHaveBeenCalled()
  })
  it('rechecks after privacy review and never silently follows sanitized URLs', async () => {
    mocks.protect.mockImplementation(async value => { mocks.state.data.companion.permissions.internet = false; return value })
    await expect(createPublicReadServices().readPublicPage!('https://example.com', true)).rejects.toThrow('授权已关闭')
    mocks.state.data.companion.permissions.internet = true; mocks.protect.mockResolvedValue('https://example.com/[protected]')
    await expect(createPublicReadServices().readPublicPage!('https://example.com', true)).rejects.toThrow('已停止读取')
    expect(mocks.invoke).not.toHaveBeenCalled()
  })
  it('cancellation after review prevents the native call', async () => {
    const controller = new AbortController(); mocks.protect.mockImplementation(async value => { controller.abort(); return value })
    await expect(createPublicReadServices(undefined, controller.signal).readPublicPage!('https://example.com', true)).rejects.toThrow('已取消')
    expect(mocks.invoke).not.toHaveBeenCalled()
  })
  it('percent encoding cannot hide private query/path values from egress protection', async () => {
    mocks.protect.mockImplementation(async (value: string) => value.replaceAll('私密词', '[protected]'))
    await expect(createPublicReadServices().readPublicPage!('https://example.com/?q=%E7%A7%81%E5%AF%86%E8%AF%8D', true)).rejects.toThrow('已停止读取')
    expect(mocks.protect.mock.calls[0][0]).toContain('私密词'); expect(mocks.invoke).not.toHaveBeenCalled()
  })
  it('discards delayed data if authority is revoked while the native fetch is in flight', async () => {
    mocks.invoke.mockImplementation(async () => { mocks.state.data.companion.permissions.internet = false; return { text: '迟到数据' } })
    await expect(createPublicReadServices().readPublicPage!('https://example.com', true)).rejects.toThrow('授权已关闭')
  })
  it('honors the live external-AI master switch for a configured cloud conversation', async () => {
    mocks.state.data.companion.provider.providerId = 'deepseek'; mocks.state.data.settings.trust.externalAiProcessing = false
    await expect(createPublicReadServices().readPublicPage!('https://example.com', true)).rejects.toThrow('外部AI处理授权已关闭')
    expect(mocks.invoke).not.toHaveBeenCalled()
  })
  it('uses fixed anonymous native GET and forwards a JSON pointer, not arbitrary headers', async () => {
    await createPublicReadServices().readPublicJson!('https://api.example.com/data', '/data', true)
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith('public_web_read', { url: 'https://api.example.com/data', kind: 'json', pointer: '/data', approved: true })
    expect(mocks.protect.mock.calls[0][1].trust.outboundProtection).toBe(true)
  })
  it.each(['http://example.com', 'https://user:pass@example.com', 'https://localhost/', 'https://127.0.0.1/', 'https://printer.local/', 'https://example.com/?access_token=x', 'https://example.com:8443/', 'https://example.com/#secret'])('refuses %s before egress', url => expect(() => publicReadUrl(url)).toThrow())
})
