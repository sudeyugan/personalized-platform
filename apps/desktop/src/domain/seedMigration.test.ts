import { describe, expect, it } from 'vitest'
import type { LibraryData } from './models'
import { createSeedLibrary, normalizeLibrary } from './seed'

describe('library compatibility normalization', () => {
  it('adds M7 music and companion defaults without changing existing writing data', () => {
    const legacy = createSeedLibrary()
    const originalText = legacy.chapters['chapter-welcome'].plainText
    legacy.settings.navigationOrder = ['home', 'writing', 'people', 'places', 'timeline', 'settings']
    delete (legacy as Partial<LibraryData>).assets
    delete (legacy as Partial<LibraryData>).aiGenerations
    delete (legacy as Partial<LibraryData>).tracks
    delete (legacy as Partial<LibraryData>).musicContexts
    delete (legacy as Partial<LibraryData>).companion
    delete (legacy.settings as Partial<LibraryData['settings']>).music

    const upgraded = normalizeLibrary(legacy)

    expect(upgraded.chapters['chapter-welcome'].plainText).toBe(originalText)
    expect(upgraded.settings.navigationOrder).toEqual(['home', 'writing', 'people', 'places', 'timeline', 'assets', 'music', 'help', 'settings'])
    expect(upgraded.assets).toEqual([])
    expect(upgraded.aiGenerations).toEqual([])
    expect(upgraded.tracks).toEqual([])
    expect(upgraded.companion.permissions).toEqual({ workIds: [], chapterIds: [], records: false, musicContext: false })
    expect(upgraded.companion.memories).toEqual([])
    expect(upgraded.companion.desktop.visible).toBe(false)
    expect(upgraded.companion.personality).toEqual({ warmth: 60, curiosity: 50, initiative: 30 })
    expect(upgraded.settings.music.autoSwitch).toBe(false)
    expect(upgraded.settings.modules.find((module) => module.id === 'music')?.available).toBe(true)
  })

  it('normalizes a large library within the one-second data preparation budget', () => {
    const library = createSeedLibrary()
    const base = library.chapters['chapter-welcome']
    library.chapters = Object.fromEntries(Array.from({ length: 10_000 }, (_, index) => [`chapter-${index}`, { ...base, id: `chapter-${index}`, title: `章节 ${index}` }]))
    const started = performance.now()
    const upgraded = normalizeLibrary(library)
    expect(Object.keys(upgraded.chapters)).toHaveLength(10_000)
    expect(performance.now() - started).toBeLessThan(1_000)
  })
})
