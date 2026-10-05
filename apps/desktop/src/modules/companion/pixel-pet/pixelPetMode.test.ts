import { describe, expect, it, vi } from 'vitest'
import { createSeedLibrary, normalizeLibrary } from '../../../domain/seed'
import { createCompanionSlice } from '../../../state/companionSlice'
import type { LibraryStore } from '../../../state/libraryStoreTypes'

const commit = vi.hoisted(() => vi.fn())
vi.mock('../../../state/persistence', () => ({ commitLibraryData: commit }))

describe('pixel mode activation preserves the original library', () => {
  it('enables interaction when explicitly selecting pixel mode without altering WebM assets', () => {
    const data = createSeedLibrary()
    data.companion.desktop.visual = { type: 'video', videos: { idle: 'base' } }
    data.companion.desktop.videoClips = { idle: ['base', 'variant'] }
    data.companion.desktop.videoPlacements = { base: { scale: 1.001, x: 0, y: 0 } }
    const slice = createCompanionSlice(() => ({ data }) as LibraryStore, vi.fn())
    slice.setCompanionPixelPet(true)
    const next = commit.mock.lastCall![0]
    expect(next.companion.desktop).toEqual({
      ...data.companion.desktop, visible: true, pixelPetEnabled: true, mode: 'interactive',
    })
    expect(next.companion.desktop.visual).toBe(data.companion.desktop.visual)
    expect(next.companion.desktop.videoClips).toBe(data.companion.desktop.videoClips)
    expect(next.companion.desktop.videoPlacements).toBe(data.companion.desktop.videoPlacements)
  })
  it('persists style and normalizes missing/invalid styles without altering WebM', () => {
    const data = createSeedLibrary()
    const slice = createCompanionSlice(() => ({ data }) as LibraryStore, vi.fn())
    slice.setCompanionPetStyle('detailed')
    const next = commit.mock.lastCall![0]
    expect(next.companion.desktop.pixelPetStyle).toBe('detailed')
    expect(next.companion.desktop.visual).toBe(data.companion.desktop.visual)
    expect(next.companion.desktop.pixelPetEnabled).toBe(false)
    expect(normalizeLibrary(JSON.parse(JSON.stringify(next))).companion.desktop.pixelPetStyle).toBe('detailed')
    delete next.companion.desktop.pixelPetStyle
    expect(normalizeLibrary(next).companion.desktop.pixelPetStyle).toBe('chibi')
    next.companion.desktop.pixelPetStyle = 'untrusted-url'
    expect(normalizeLibrary(next).companion.desktop.pixelPetStyle).toBe('chibi')
  })
  it('saves only allowlisted sides and keeps WebM settings unchanged', () => {
    const data = createSeedLibrary()
    const slice = createCompanionSlice(() => ({ data }) as LibraryStore, vi.fn())
    slice.setCompanionPetSide('left-edge')
    const next = commit.mock.lastCall![0]
    expect(normalizeLibrary(JSON.parse(JSON.stringify(next))).companion.desktop.pixelPetSide).toBe('left-edge')
    expect(next.companion.desktop.visual).toBe(data.companion.desktop.visual)
    slice.setCompanionPetSide('bottom-edge')
    expect(normalizeLibrary(JSON.parse(JSON.stringify(commit.mock.lastCall![0]))).companion.desktop.pixelPetSide).toBe('bottom-edge')
    delete next.companion.desktop.pixelPetSide
    expect(normalizeLibrary(next).companion.desktop.pixelPetSide).toBe('right-edge')
    next.companion.desktop.pixelPetSide = 'sleep'
    expect(normalizeLibrary(next).companion.desktop.pixelPetSide).toBe('right-edge')
  })
  it('does not reset normal mode or override quiet mode when disabling pixel rendering', () => {
    const data = createSeedLibrary()
    const slice = createCompanionSlice(() => ({ data }) as LibraryStore, vi.fn())
    data.companion.desktop.mode = 'normal'
    slice.setCompanionPixelPet(true)
    expect(commit.mock.lastCall![0].companion.desktop.mode).toBe('normal')
    data.companion.desktop.mode = 'quiet'
    slice.setCompanionPixelPet(false)
    expect(commit.mock.lastCall![0].companion.desktop.mode).toBe('quiet')
  })
})
