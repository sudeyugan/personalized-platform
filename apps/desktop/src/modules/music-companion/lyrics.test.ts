import { describe, expect, it } from 'vitest'
import { lyricAt, lyricExcerptAt, parseLrc } from './lyrics'

describe('local synchronized lyrics', () => {
  it('supports fractional time, multiple stamps, offsets and sorting', () => {
    expect(parseLrc('[offset:-100]\n[00:02.50][00:04.125]你好\n[00:01]第一句')).toEqual([{ at: 900, text: '第一句' }, { at: 2400, text: '你好' }, { at: 4025, text: '你好' }])
  })
  it('does not invent lyrics before the first line or in long gaps', () => {
    const lines = parseLrc('[00:01.00]你好\n[00:30.00]回来')
    expect(lyricAt(lines, 0)).toBe('')
    expect(lyricAt(lines, 1500)).toBe('你好')
    expect(lyricAt(lines, 25000)).toBe('')
    expect(lyricAt(lines, 30100)).toBe('回来')
  })
  it('ignores metadata and invalid timestamps, bounds file size', () => {
    expect(parseLrc('[ar:歌手]\n[00:80]错误')).toEqual([])
    expect(() => parseLrc('a'.repeat(200001))).toThrow()
  })
  it('returns a bounded three-line excerpt and follows seeks in both directions', () => {
    const lines = parseLrc('[00:01]前一句\n[00:03]当前句\n[00:05]后一句\n[00:07]再下一句')
    expect(lyricExcerptAt(lines, 3500)).toEqual({ previous: '前一句', current: '当前句', next: '后一句', at: 3000 })
    expect(lyricExcerptAt(lines, 7500)).toEqual({ previous: '后一句', current: '再下一句', next: '', at: 7000 })
    expect(lyricExcerptAt(lines, 1500).current).toBe('前一句')
    expect(lyricExcerptAt(parseLrc('[00:01]' + '字'.repeat(400)), 1200).current.length).toBe(300)
  })
  it('does not mark an upcoming line as current during intros, gaps or invalid progress', () => {
    const lines = parseLrc('[00:01]第一句\n[00:40]第二句')
    expect(lyricExcerptAt(lines, 0)).toEqual({ previous: '', current: '', next: '第一句', at: null })
    expect(lyricExcerptAt(lines, 30000)).toEqual({ previous: '', current: '', next: '第二句', at: null })
    expect(lyricExcerptAt(lines, NaN)).toEqual({ previous: '', current: '', next: '', at: null })
    expect(lyricExcerptAt([], 0).current).toBe('')
  })
})
