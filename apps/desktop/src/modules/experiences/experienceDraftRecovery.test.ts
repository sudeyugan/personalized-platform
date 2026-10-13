import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExperienceDraft } from '../../domain/experiences'
import { readExperienceRecovery, removeExperienceRecovery, saveExperienceRecovery, setExperienceRecovery } from './experienceDraftRecovery'

const draft: ExperienceDraft = { title: '未保存作品', category: 'novel', creator: '', note: '私人的感想', dateText: '', paperStyle: 'linen' }
const save = (scope: string, key = 'new-work', coverNeedsReselect = false) => saveExperienceRecovery(scope, { key, draft, coverNeedsReselect, updatedAt: '2026-10-10T00:00:00Z' })
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })
describe('opt-in local text draft recovery', () => {
  it('defaults off, isolates libraries and clears only the disabled library', () => {
    save('A'); expect(localStorage.length).toBe(0)
    setExperienceRecovery('A', true); save('A')
    expect(readExperienceRecovery('A').drafts[0].draft).toMatchObject(draft)
    expect(readExperienceRecovery('B')).toMatchObject({ enabled: false, drafts: [] })
    setExperienceRecovery('B', true); save('B')
    setExperienceRecovery('A', false)
    expect(readExperienceRecovery('A').drafts).toEqual([])
    expect(readExperienceRecovery('B').drafts).toHaveLength(1)
  })
  it('deduplicates keys, bounds storage to six drafts and removes just the chosen draft', () => {
    setExperienceRecovery('A', true)
    for (let i = 0; i < 8; i++) save('A', `record-${i}`)
    save('A', 'record-7')
    expect(readExperienceRecovery('A').drafts.map(item => item.key)).toEqual(['record-7', 'record-6', 'record-5', 'record-4', 'record-3', 'record-2'])
    removeExperienceRecovery('A', 'record-4'); expect(readExperienceRecovery('A').drafts).toHaveLength(5)
  })
  it('whitelists text and metadata; a missing image has neither file bytes nor stale attribution', () => {
    setExperienceRecovery('A', true)
    saveExperienceRecovery('A', { key: 'new-work', updatedAt: '', coverNeedsReselect: true, draft: { ...draft, source: { provider: 'webnovel', url: 'https://example.com/book', credit: '来源' }, coverAssetId: 'asset-test', privateBytes: 'do-not-store' } as ExperienceDraft })
    const record = readExperienceRecovery('A').drafts[0]
    expect(record.coverNeedsReselect).toBe(true)
    expect(record.draft.source).toBeUndefined(); expect(record.draft.coverAssetId).toBeUndefined()
    expect(localStorage.getItem(localStorage.key(0)!)).not.toContain('do-not-store')
  })
  it('reports corrupt/quota failures without changing formal records and permits explicit clearing', () => {
    setExperienceRecovery('A', true)
    localStorage.setItem(localStorage.key(0)!, '{broken')
    expect(() => readExperienceRecovery('A')).toThrow()
    setExperienceRecovery('A', false); expect(readExperienceRecovery('A').enabled).toBe(false)
    setExperienceRecovery('A', true)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError') })
    expect(() => save('A')).toThrow('quota')
    expect(readExperienceRecovery('A').drafts).toEqual([])
  })
})
