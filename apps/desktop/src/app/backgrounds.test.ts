import { describe, expect, it } from 'vitest'
import type { LibraryData } from '../domain/models'
import { backgroundSceneForView, resolveContentBackground } from './backgrounds'

const settings = {
  backgrounds: {
    images: {
      default: 'data:image/png;base64,default',
      daily: 'data:image/png;base64,daily',
      creation: 'data:image/png;base64,creation',
      immersive: 'data:image/png;base64,immersive',
    },
    sidebarMode: 'decoration',
  },
} as LibraryData['settings']

describe('content backgrounds', () => {
  it('selects the image assigned to each page scene', () => {
    expect(backgroundSceneForView('home')).toBe('daily')
    expect(resolveContentBackground(settings, 'home').image).toBe('data:image/png;base64,daily')
    expect(resolveContentBackground(settings, 'diary').image).toBe('data:image/png;base64,creation')
    expect(resolveContentBackground(settings, 'music').image).toBe('data:image/png;base64,immersive')
    expect(resolveContentBackground(settings, 'settings').image).toBe('data:image/png;base64,default')
  })

  it('falls back to the common background when a scene has no image', () => {
    const withoutDaily = {
      ...settings,
      backgrounds: { ...settings.backgrounds, images: { default: settings.backgrounds.images.default } },
    } as LibraryData['settings']

    expect(resolveContentBackground(withoutDaily, 'home').image).toBe('data:image/png;base64,default')
  })
})
