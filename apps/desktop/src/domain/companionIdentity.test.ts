import { describe, expect, it } from 'vitest'
import { createSeedLibrary, normalizeLibrary } from './seed'
import { normalizeCompanionName, supportsNameWake, stripCompanionAddress } from './companionIdentity'
import { companionDesktopSnapshot } from '../modules/companion/companionDesktop'

describe('single companion identity', () => {
  it('uses 小鱼 for all new-library and desktop defaults', () => {
    const data = createSeedLibrary()
    expect(data.companion.name).toBe('小鱼')
    expect(data.companion.voice.wakeWord).toBe('小鱼')
    expect(companionDesktopSnapshot(data.companion, 'home', false).voice.wakeWord).toBe('小鱼')
  })
  it('migrates the old mismatched default to the existing wake name, idempotently', () => {
    const data = createSeedLibrary()
    data.companion.name = '小隅'
    data.companion.voice.wakeWord = '小鱼'
    const normalized = normalizeLibrary(data)
    expect(normalized.companion.name).toBe('小鱼')
    expect(normalizeLibrary(normalized)).toEqual(normalized)
    data.companion.voice.wakeWord = '阿璃'
    expect(normalizeLibrary(data).companion.name).toBe('阿璃')
  })
  it('preserves custom names and makes the stale wake field a synchronized mirror', () => {
    const data = createSeedLibrary()
    data.companion.name = '阿璃'
    data.companion.voice.wakeEnabled = true
    expect(normalizeLibrary(data).companion.voice).toMatchObject({ wakeWord: '阿璃', wakeEnabled: true })
    expect(companionDesktopSnapshot(data.companion, 'home', false).voice.wakeWord).toBe('阿璃')
  })
  it('keeps unsupported display names but disables wake without a secret fallback', () => {
    const data = createSeedLibrary()
    data.companion.name = 'Yuki'
    data.companion.voice.wakeEnabled = true
    expect(normalizeLibrary(data).companion).toMatchObject({ name: 'Yuki', voice: { wakeWord: 'Yuki', wakeEnabled: false } })
    expect(companionDesktopSnapshot(data.companion, 'home', false).voice.wakeEnabled).toBe(false)
    expect(['鱼', '小鱼鱼鱼鱼鱼鱼', 'A璃', '阿 璃'].every(name => !supportsNameWake(name))).toBe(true)
  })
  it('bounds name data and strips literal, not regex addresses', () => {
    expect(normalizeCompanionName(' \n阿璃\t ')).toBe('阿璃')
    expect(normalizeCompanionName(' ')).toBe('小鱼')
    expect(normalizeCompanionName('长'.repeat(50))).toHaveLength(20)
    expect(stripCompanionAddress('A[1]，打开首页', 'A[1]')).toBe('打开首页')
    expect(stripCompanionAddress('A1，打开首页', 'A[1]')).toBe('A1，打开首页')
  })
})
