import { describe, expect, it } from 'vitest'
import { backgroundPresentation } from './backgroundPresentation'
import { createSeedLibrary, normalizeLibrary } from '../../domain/seed'
import { referencedAssetIds } from '../../state/assetsSlice'

describe('unified backgrounds', () => {
  it('uses safe readable bounds for imported preferences', () => {
    const value = backgroundPresentation({ images: {}, sidebarMode: 'soft', positionX: NaN, artSize: 999, paperOpacity: 0 })
    expect(value.mode).toBe('wallpaper')
    expect(value.style).toMatchObject({ '--background-x': '80%', '--background-size': '85%', '--paper-opacity': '80%' })
  })
  it('preserves new background modes and legacy images', () => {
    const data = createSeedLibrary()
    data.settings.backgrounds = { images: { default: 'asset:bg', daily: 'asset:bg', sidebar: 'data:image/png;base64,old' }, sidebarMode: 'decoration', mode: 'illustration', artSize: 40 }
    expect(normalizeLibrary(data).settings.backgrounds).toMatchObject(data.settings.backgrounds)
    expect(referencedAssetIds(data).has('bg')).toBe(true)
  })
})
