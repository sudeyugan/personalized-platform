import { describe, expect, it } from 'vitest'
import { retainVersions } from './useLibraryStore'

describe('version retention', () => {
  it('keeps every pinned version and only the newest 100 automatic versions', () => {
    const versions = Array.from({ length: 130 }, (_, index) => ({ index, pinned: index === 2 || index === 8 }))
    const retained = retainVersions(versions)
    expect(retained.filter((item) => !item.pinned)).toHaveLength(100)
    expect(retained.some((item) => item.index === 2)).toBe(true)
    expect(retained.some((item) => item.index === 8)).toBe(true)
  })
})
