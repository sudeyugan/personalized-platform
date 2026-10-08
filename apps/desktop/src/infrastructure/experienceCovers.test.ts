import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { experienceCovers, suggestedProvider } from './experienceCovers'
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
describe('explicit cover requests', () => {
  beforeEach(() => { vi.clearAllMocks(); delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ })
  it('keeps preview and offline recording free of implicit network calls', async () => {
    expect(await experienceCovers.hasKey('weread')).toBe(false)
    await expect(experienceCovers.search('weread','novel','作品')).rejects.toThrow('浏览器预览不联网')
    expect(invoke).not.toHaveBeenCalled()
  })
  it('only sends selected provider, category and query to a fixed native command', async () => {
    Object.assign(window, { __TAURI_INTERNALS__: {} })
    vi.mocked(invoke).mockResolvedValue([])
    await experienceCovers.search('weread', 'novel', '  作品名称  ')
    expect(invoke).toHaveBeenCalledExactlyOnceWith('experience_cover_search', { provider: 'weread', category: 'novel', query: '作品名称', creator: '' })
  })
  it('keeps keys in dedicated native secrets and never writes browser storage', async () => {
    Object.assign(window, { __TAURI_INTERNALS__: {} })
    vi.mocked(invoke).mockResolvedValue(undefined)
    const before = JSON.stringify(localStorage)
    await experienceCovers.storeKey('weread', 'wrk-test-key')
    expect(invoke).toHaveBeenCalledWith('store_secret', { id: 'experiences-weread', secret: 'wrk-test-key' })
    expect(JSON.stringify(localStorage)).toBe(before)
    await expect(experienceCovers.storeKey('weread', 'line\ninjection')).rejects.toThrow('密钥格式不正确')
    expect(invoke).toHaveBeenCalledTimes(1)
  })
  it('selects appropriate default sources without querying them', () => {
    expect(suggestedProvider('novel')).toBe('weread')
    expect(suggestedProvider('anime')).toBe('bangumi')
    expect(suggestedProvider('film')).toBe('tmdb')
    expect(suggestedProvider('book')).toBe('openlibrary')
    expect(invoke).not.toHaveBeenCalled()
  })
})
