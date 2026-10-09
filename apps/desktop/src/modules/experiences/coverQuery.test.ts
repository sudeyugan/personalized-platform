import { describe, expect, it } from 'vitest'
import { novelCoverHints } from './coverQuery'
import { rankCovers, coverMatch } from './coverMatching'
import type { CoverCandidate } from '../../infrastructure/experienceCovers'

describe('public novel search scenarios', () => {
  it.each([
    [' 雪 中 悍 刀 行 ', '雪中悍刀行', ''],
    ['《雪中悍刀行》 烽火戏诸侯著', '雪中悍刀行', '烽火戏诸侯'],
    ['雪中悍刀行 作者：烽火戏诸侯', '雪中悍刀行', '烽火戏诸侯'],
    ['Ｈａｒｒｙ Potter', 'Harry Potter', ''],
    ['龙族 III 黑月之潮', '龙族 III 黑月之潮', ''],
    ['\u200b雪中悍刀行\ufeff', '雪中悍刀行', ''],
  ])('normalizes explicit syntax without guessing an author: %s', (query, title, creator) => {
    expect(novelCoverHints({ title: query, creator: '', year: '2020' })).toEqual({ title, creator, year: '2020' })
  })
  it('keeps original works ahead of derivatives and does not certify an unknown author', () => {
    const original: CoverCandidate = { id: '1', provider: 'webnovel', title: '雪中悍刀行', creator: '烽火戏诸侯', year: '', sourceUrl: 'https://www.zongheng.com/detail/189169', credit: '纵横' }
    const derivative = { ...original, id: '2', title: '雪中悍刀行之北莽', creator: '另一位作者' }
    const hints = { title: '《雪中悍刀行》 烽火戏诸侯著', creator: '', year: '' }
    expect(rankCovers([derivative, original], hints)[0]).toBe(original)
    expect(coverMatch(original, hints).label).toBe('名称相同 · 作者匹配')
    expect(coverMatch({ ...original, creator: '' }, hints).label).toContain('请核对作者')
    expect(coverMatch(original, { ...hints, title: '雪中悍刀行 烽火戏诸侯' }).label).toBe('名称相同')
  })
})
