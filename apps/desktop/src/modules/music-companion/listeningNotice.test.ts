import { describe, expect, it } from 'vitest'
import { createListeningNotice } from './listeningNotice'

describe('low-frequency listening glance', () => {
  it('warms up, eases and cools down', () => {
    const update = createListeningNotice()
    expect(update(0, true, false)).toBe(0)
    expect(update(45000, true, false)).toBe(0)
    expect(update(45500, true, false)).toBe(1)
    expect(update(46500, true, false)).toBe(0)
    expect(update(100000, true, false)).toBe(0)
    update(165000, true, false)
    expect(update(165500, true, false)).toBe(1)
  })
  it('interruptions cancel without queued replay', () => {
    const update = createListeningNotice()
    update(0, true, false); update(45000, true, false)
    expect(update(45500, true, true)).toBe(0)
    expect(update(46000, true, false)).toBe(0)
    expect(update(100000, false, false)).toBe(0)
  })
})
