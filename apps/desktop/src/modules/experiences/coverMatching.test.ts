import { describe, expect, it } from 'vitest'
import { rankCovers, coverMatch } from './coverMatching'
import type { CoverCandidate } from '../../infrastructure/experienceCovers'
const candidate = (creator: string, year: string): CoverCandidate => ({ id: creator, provider: 'openlibrary', title: 'Same title', creator, year, sourceUrl: 'https://openlibrary.org/works/OL1W', credit: 'Open Library' })
describe('cover identity hints', () => {
  it('ranks author and edition year instead of silently accepting the first same-name work', () => {
    const hints = { title: 'Same title', creator: 'Correct', year: '2020' }
    const ranked = rankCovers([candidate('Other', '2020'), candidate('Correct', '2000'), candidate('Correct', '2020')], hints)
    expect(ranked[0].year).toBe('2020'); expect(ranked[0].creator).toBe('Correct')
    expect(coverMatch(ranked[0], hints).label).toBe('名称相同 · 作者匹配 · 年份匹配')
    expect(coverMatch(candidate('', ''), hints).label).toContain('请核对作者')
  })
})
