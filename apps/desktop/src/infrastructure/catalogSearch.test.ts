import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSeedLibrary } from '../domain/seed'
import { parseSearchQueries, safePublicLink, searchCatalog } from './catalogSearch'
const remote = vi.hoisted(() => ({ search: vi.fn(), generate: vi.fn() }))
vi.mock('./webSearch', () => ({ searchWeb: remote.search }))
vi.mock('./companionProvider', () => ({ createCompanionProvider: () => ({ id: 'deepseek', generate: remote.generate }) }))
describe('explicit catalog assistance', () => {
  beforeEach(() => { remote.search.mockReset().mockResolvedValue([{ title: 'Public title', snippet: 'Public evidence', url: 'https://example.org/work', provider: 'tencent' }]); remote.generate.mockReset().mockResolvedValue({ type: 'text', text: '{"queries":["Alias"]}' }) })
  it('accepts short plain queries, never model image URLs or executable structures', () => {
    expect(parseSearchQueries('{"queries":["Alias","Alias","https://evil.test/image.png",{"title":"tool"}]}')).toEqual(['Alias'])
    expect(parseSearchQueries('model prose')).toEqual([])
    expect(safePublicLink('javascript:alert(1)')).toBeUndefined()
    expect(safePublicLink('https://127.0.0.1/a')).toBeUndefined()
    expect(safePublicLink('https://user:secret@example.org/a')).toBeUndefined()
  })
  it('filters the query and sends only bounded public snippets, not private card notes', async () => {
    const data = createSeedLibrary(); data.companion.provider.providerId = 'deepseek'; data.settings.trust.externalAiProcessing = true
    data.settings.trust.outboundProtection = true
    data.settings.trust.privateDictionary = [{ id: 'one', value: 'Private name', category: 'other', enabled: true }]
    data.experiences = { entries: [], tierLabels: { top: '秘密感想', great: 'great', good: 'good', ordinary: 'ordinary', poor: 'poor' } }
    const result = await searchCatalog('Private name novel', data, true, async () => true, new AbortController().signal)
    expect(remote.search.mock.calls[0][0]).not.toContain('Private name')
    expect(JSON.stringify(remote.generate.mock.calls[0][0])).not.toContain('秘密感想')
    expect(result.queries).toEqual(['Alias'])
    expect(remote.generate.mock.calls[0][0].tools).toEqual([])
  })
  it('cancelled privacy review prevents search and a disabled AI export prevents model calls', async () => {
    const data = createSeedLibrary(); data.settings.trust.outboundProtection = true; data.settings.trust.outboundReviewMode = 'strict'
    await expect(searchCatalog('a work', data, true, async () => false, new AbortController().signal)).rejects.toThrow('已取消')
    expect(remote.search).not.toHaveBeenCalled()
    await searchCatalog('a work', data, true, async () => true, new AbortController().signal)
    expect(remote.generate).not.toHaveBeenCalled()
  })
  it('does not call DeepSeek after external processing is revoked during the search', async () => {
    const data = createSeedLibrary(); data.companion.provider.providerId = 'deepseek'; data.settings.trust.externalAiProcessing = true
    let current = data
    remote.search.mockImplementationOnce(async () => {
      current = { ...data, settings: { ...data.settings, trust: { ...data.settings.trust, externalAiProcessing: false } } }
      return []
    })
    await expect(searchCatalog('work', data, true, async () => true, new AbortController().signal, () => current)).rejects.toThrow('配置已变化')
    expect(remote.generate).not.toHaveBeenCalled()
  })
})
