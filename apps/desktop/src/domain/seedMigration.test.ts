import { describe, expect, it } from 'vitest'
import type { LibraryData } from './models'
import { createSeedLibrary, normalizeLibrary } from './seed'

describe('library compatibility normalization', () => {
  it('adds local wake and voiceprint defaults to older companion voice settings', () => {
    const legacy = createSeedLibrary()
    delete (legacy.companion.voice as Partial<LibraryData['companion']['voice']>).wakeWord
    delete (legacy.companion.voice as Partial<LibraryData['companion']['voice']>).wakeSensitivity
    delete (legacy.companion.voice as Partial<LibraryData['companion']['voice']>).conversationMode
    delete (legacy.companion.voice as Partial<LibraryData['companion']['voice']>).speakerVerification
    delete (legacy.companion.voice as Partial<LibraryData['companion']['voice']>).modelDownloadSource
    delete (legacy.companion.desktop as Partial<LibraryData['companion']['desktop']>).mode

    const upgraded = normalizeLibrary(legacy)

    expect(upgraded.companion.voice.wakeWord).toBe('小鱼')
    expect(upgraded.companion.voice.wakeSensitivity).toBe('standard')
    expect(upgraded.companion.voice.conversationMode).toBe('short')
    expect(upgraded.companion.voice.speakerVerification).toBe(true)
    expect(upgraded.companion.voice.modelDownloadSource).toBe('china')
    expect(upgraded.companion.desktop.mode).toBe('quiet')
  })

  it('moves the legacy single background into the default background slot', () => {
    const legacy = createSeedLibrary()
    delete (legacy.settings as Partial<LibraryData['settings']>).backgrounds
    legacy.settings.backgroundImage = 'data:image/png;base64,legacy'

    const upgraded = normalizeLibrary(legacy)

    expect(upgraded.settings.backgrounds.images.default).toBe('data:image/png;base64,legacy')
    expect(upgraded.settings.backgrounds.sidebarMode).toBe('decoration')
    expect(upgraded.settings.backgroundImage).toBeUndefined()
  })

  it('adds M7 music and companion defaults without changing existing writing data', () => {
    const legacy = createSeedLibrary()
    const originalText = legacy.chapters['chapter-welcome'].plainText
    legacy.settings.navigationOrder = ['home', 'writing', 'people', 'places', 'timeline', 'settings']
    ;(legacy.session as unknown as { activeView: string }).activeView = 'journal'
    delete (legacy as Partial<LibraryData>).assets
    delete (legacy as Partial<LibraryData>).aiGenerations
    delete (legacy as Partial<LibraryData>).tracks
    delete (legacy as Partial<LibraryData>).musicContexts
    delete (legacy as Partial<LibraryData>).companion
    delete (legacy.settings as Partial<LibraryData['settings']>).music

    const upgraded = normalizeLibrary(legacy)

    expect(upgraded.chapters['chapter-welcome'].plainText).toBe(originalText)
    expect(upgraded.settings.navigationOrder).toEqual(['home', 'answerBook', 'calendar', 'todos', 'writing', 'diary', 'people', 'places', 'timeline', 'assets', 'music', 'help', 'settings'])
    expect(upgraded.session.activeView).toBe('calendar')
    expect(upgraded.assets).toEqual([])
    expect(upgraded.aiGenerations).toEqual([])
    expect(upgraded.tracks).toEqual([])
    expect(upgraded.companion.permissions).toEqual({ workIds: [], chapterIds: [], records: false, planner: false, todos: false, calendar: false, courses: false, dailyQuestions: false, diary: false, mood: false, memories: false, answerBook: false, musicContext: false, internet: false, writeActions: false, writePolicy: 'balanced' })
    expect(upgraded.companion.memories).toEqual([])
    expect(upgraded.companion.desktop.visible).toBe(false)
    expect(upgraded.companion.desktop.toggleShortcut).toBe('CommandOrControl+Alt+Y')
    expect(upgraded.companion.desktop.quietShortcut).toBe('CommandOrControl+Alt+T')
    expect(upgraded.companion.personality).toEqual({ warmth: 60, curiosity: 50, initiative: 30 })
    expect(upgraded.settings.music.autoSwitch).toBe(false)
    expect(upgraded.settings.modules.find((module) => module.id === 'music')?.available).toBe(true)
  })

  it('upgrades old WebM states into the current twelve-state library', () => {
    const legacy = createSeedLibrary()
    legacy.companion.provider.providerId = 'deepseek'
    legacy.companion.desktop.visual = { type: 'video', videos: { idle: 'idle-1', happy: 'happy-1', thinking: 'thinking-1', agreeing: 'agreeing-1' } } as unknown as LibraryData['companion']['desktop']['visual']
    legacy.companion.desktop.videoAssets = { idle: 'idle-1', happy: 'happy-1', thinking: 'thinking-1', agreeing: 'agreeing-1' } as unknown as LibraryData['companion']['desktop']['videoAssets']
    delete legacy.companion.desktop.videoClips
    delete (legacy.settings as Partial<LibraryData['settings']>).trust

    const upgraded = normalizeLibrary(legacy)

    expect(upgraded.companion.desktop.videoClips).toEqual({ idle: ['idle-1'], celebrating: ['happy-1'], looking: ['thinking-1'], nodding: ['agreeing-1'] })
    expect(upgraded.companion.desktop.visual).toMatchObject({ type: 'video', videos: { idle: 'idle-1', celebrating: 'happy-1', looking: 'thinking-1', nodding: 'agreeing-1' } })
    expect(upgraded.settings.trust.externalAiProcessing).toBe(true)
    expect(upgraded.settings.trust.outboundProtection).toBe(true)
    expect(upgraded.settings.trust.outboundReviewMode).toBe('balanced')
    expect(upgraded.settings.trust.privateDictionary).toEqual([])
  })
  it('moves the retired excited mood into empty without dropping its points', () => {
    const legacy = createSeedLibrary()
    legacy.planner.moodEntries = [{
      id: 'legacy-excited',
      date: '2026-09-24',
      period: 'evening',
      points: { excited: 5 },
      createdAt: '2026-09-24T12:00:00.000Z',
      updatedAt: '2026-09-24T12:00:00.000Z',
    }] as unknown as LibraryData['planner']['moodEntries']

    const upgraded = normalizeLibrary(legacy)

    expect(upgraded.planner.moodEntries[0]?.points).toEqual({ empty: 5 })
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
