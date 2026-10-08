import { describe, expect, it } from 'vitest'
import { createSeedLibrary, normalizeLibrary } from './seed'
import { emptyExperiences, normalizeExperiences, rankExperience, safeSourceUrl, type ExperienceEntry } from './experiences'

const entry = (id: string, category: ExperienceEntry['category'] = 'novel', tier?: ExperienceEntry['tier'], order = 0): ExperienceEntry => ({ id, category, tier, order, title: id, creator: '', dateText: '', note: '', paperStyle: 'linen', createdAt: '2026-10-05', updatedAt: '2026-10-05' })
describe('personal experiences', () => {
  it('adds an empty collection and enabled navigation to an old library without changing existing content', () => {
    const data = normalizeLibrary(createSeedLibrary())
    delete data.experiences
    data.settings.modules = data.settings.modules.filter(item => item.id !== 'experiences')
    data.settings.navigationOrder = data.settings.navigationOrder.filter(id => id !== 'experiences')
    const normalized = normalizeLibrary(data)
    expect(normalized.experiences).toEqual(emptyExperiences())
    expect(normalized.settings.navigationOrder.filter(id => id === 'experiences')).toHaveLength(1)
    expect(normalized.chapters).toEqual(data.chapters)
    expect(normalized.settings.modules.find(item => item.id === 'experiences')).toMatchObject({ available: true, enabled: true })
  })
  it('preserves impressions, approximate date, image provenance and custom tiers across normalization and JSON backup', () => {
    const experiences = { ...emptyExperiences(), entries: [{ ...entry('experience-a'), note: '我自己的感受', dateText: '去年夏天', coverAssetId: 'asset-abc', source: { provider: 'weread', url: 'https://weread.qq.com/', credit: '微信读书' } }] }
    experiences.tierLabels.top = '心头好'
    const data = { ...createSeedLibrary(), experiences }
    expect(normalizeLibrary(JSON.parse(JSON.stringify(data))).experiences).toEqual(experiences)
  })
  it('rejects invalid entries, duplicates, executable sources and malformed tiers', () => {
    const normalized = normalizeExperiences({ entries: [null, { title: '' }, { ...entry('a'), tier: 'bogus', source: { provider: 'weread', url: 'javascript:alert(1)' } }, entry('a')], tierLabels: { top: '', good: '确实不错' } })
    expect(normalized.entries).toHaveLength(1)
    expect(normalized.entries[0].tier).toBeUndefined()
    expect(normalized.entries[0].source).toBeUndefined()
    expect(normalized.tierLabels.top).toBe('夯')
    expect(normalized.tierLabels.good).toBe('确实不错')
  })
  it('moves between tiers, inserts before a specific card, and keeps places independent', () => {
    const entries = [entry('a', 'novel', 'top', 0), entry('b', 'anime', 'top', 1), entry('c'), entry('place', 'place', 'top', 0)]
    const moved = rankExperience(entries, 'c', 'top', 'b')
    expect(moved.filter(item => item.category !== 'place').sort((a,b) => a.order - b.order).map(item => item.id)).toEqual(['a','c','b'])
    expect(moved.find(item => item.id === 'place')).toEqual(entries[3])
    expect(rankExperience(moved, 'c', undefined).find(item => item.id === 'c')?.tier).toBeUndefined()
    expect(rankExperience(entries, 'missing', 'top')).toBe(entries)
  })
  it('does not rank deleted cards or accept credentials in source links', () => {
    const entries = [{ ...entry('a'), deletedAt: '2026-10-05' }]
    expect(rankExperience(entries, 'a', 'top')).toBe(entries)
    for (const source of ['javascript:alert(1)','file:///etc/passwd','https://user:password@weread.qq.com/','https://example.com:8443/']) expect(safeSourceUrl(source)).toBeUndefined()
  })
})
