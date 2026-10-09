import { describe, expect, it } from 'vitest'
import { rankCovers, rankCoverResults, coverMatch } from './coverMatching'
import type { CoverCandidate } from '../../infrastructure/experienceCovers'
const candidate = (creator: string, year: string): CoverCandidate => ({ id: creator, provider: 'openlibrary', title: 'Same title', creator, year, sourceUrl: 'https://openlibrary.org/works/OL1W', credit: 'Open Library' })
describe('cover identity hints', () => {
  it('prefers actual downloaded covers only among equally matched works', () => {
    const hints = { title: '狩魔手记', creator: '烟雨江南', year: '' }
    const exact = { ...candidate('烟雨江南', ''), title: '狩魔手记' }
    const file = new File(['fixture'], 'cover.webp', { type: 'image/webp' })
    const missing = { candidate: exact }
    const available = { candidate: { ...exact, id: 'available' }, file }
    const wrongAuthor = { candidate: { ...exact, creator: '另一个作者' }, file }
    const wrongTitle = { candidate: { ...exact, title: '猎魔手记' }, file }
    const results = [missing, wrongAuthor, wrongTitle, available]
    expect(rankCoverResults(results, hints)).toEqual([available, missing, wrongTitle, wrongAuthor])
    expect(results[0]).toBe(missing)
  })
  it('ranks explicit official rename clues above unrelated titles containing the old title', () => {
    const renamed = { ...candidate('', ''), provider: 'webnovel' as const, title: '我的女友是恶劣大小姐', matchedTitle: '我加载了恋爱游戏' }
    const unrelated = { ...candidate('', ''), provider: 'webnovel' as const, title: '关于我加载了恋爱游戏这件事' }
    const hints = { title: '我加载了恋爱游戏', creator: '', year: '' }
    expect(rankCovers([unrelated, renamed], hints)[0]).toBe(renamed)
    expect(coverMatch(renamed, hints).label).toBe('官方更名线索 · 请核对')
    expect(coverMatch({ ...renamed, provider: 'openlibrary' }, hints).label).toBe('请核对名称')
  })
  it('ranks author and edition year instead of silently accepting the first same-name work', () => {
    const hints = { title: 'Same title', creator: 'Correct', year: '2020' }
    const ranked = rankCovers([candidate('Other', '2020'), candidate('Correct', '2000'), candidate('Correct', '2020')], hints)
    expect(ranked[0].year).toBe('2020'); expect(ranked[0].creator).toBe('Correct')
    expect(coverMatch(ranked[0], hints).label).toBe('名称相同 · 作者匹配 · 年份匹配')
    expect(coverMatch(candidate('', ''), hints).label).toContain('请核对作者')
  })
})
