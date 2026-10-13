import { describe, expect, it, vi } from 'vitest'
import { createSeedLibrary } from '../../domain/seed'
import { continueWriting } from './continueWriting'
import { useLibraryStore } from '../../state/useLibraryStore'
vi.mock('../../state/persistence', () => ({ queueLibrarySave: vi.fn(), commitLibraryData: vi.fn() }))

function fixture() {
  const data = createSeedLibrary()
  const work = data.works[0], chapter = Object.values(data.chapters)[0]
  data.works = [{ ...work, id: 'a', chapterIds: ['a1'], targetWords: 100 }, { ...work, id: 'b', chapterIds: ['b1'] }]
  data.chapters = { a1: { ...chapter, id: 'a1', workId: 'a', wordCount: 20 }, b1: { ...chapter, id: 'b1', workId: 'b', wordCount: 900, updatedAt: '2099-01-01' }, trash: { ...chapter, id: 'trash', workId: 'a', wordCount: 1000, deletedAt: '2026-10-09', updatedAt: '2099-01-02' } }
  data.session.activeWorkId = 'a'; data.session.activeChapterId = 'b1'
  return data
}
describe('continue writing ownership', () => {
  it('synchronizes ownership when closing or trashing cross-work tabs, excluding invalid tabs', () => {
    for (const action of ['closeChapter', 'trashChapter'] as const) {
      const data = fixture(); data.session.activeChapterId = 'a1'; data.session.openChapterIds = ['a1', 'trash', 'b1', 'missing']
      useLibraryStore.setState({ data }); useLibraryStore.getState()[action]('a1')
      expect(useLibraryStore.getState().data.session).toMatchObject({ activeWorkId: 'b', activeChapterId: 'b1', openChapterIds: ['b1'] })
      expect(continueWriting(useLibraryStore.getState().data).work?.id).toBe('b')
    }
  })
  it('counts and opens only live chapters of the displayed work', () => {
    const selected = continueWriting(fixture())
    expect(selected).toMatchObject({ work: { id: 'a' }, chapter: { id: 'a1' }, words: 20, progress: 20 })
  })
  it('excludes deleted works, handles zero target and disables locked work continuation', () => {
    const data = fixture(); data.works[0].deletedAt = 'today'; data.works[1].targetWords = 0
    expect(continueWriting(data)).toMatchObject({ work: { id: 'b' }, progress: 0 })
    data.works[1].locked = true
    expect(continueWriting(data)).toMatchObject({ chapter: undefined, words: 0 })
  })
  it('synchronizes work when selecting or deep-linking across works and rejects trash/locks', () => {
    const data = fixture(); useLibraryStore.setState({ data })
    useLibraryStore.getState().selectChapter('b1')
    expect(useLibraryStore.getState().data.session.activeWorkId).toBe('b')
    useLibraryStore.getState().openAgentDestination({ destination: 'writing.chapter', targetId: 'a1' })
    expect(useLibraryStore.getState().data.session.activeWorkId).toBe('a')
    useLibraryStore.getState().selectChapter('trash')
    expect(useLibraryStore.getState().data.session.activeChapterId).toBe('a1')
    useLibraryStore.getState().data.works[1].locked = true
    useLibraryStore.getState().openAgentDestination({ destination: 'writing.chapter', targetId: 'b1' })
    expect(useLibraryStore.getState().data.session.activeWorkId).toBe('a')
    useLibraryStore.getState().selectWork('b')
    expect(useLibraryStore.getState().data.session).toMatchObject({ activeWorkId: 'b', activeChapterId: '', openChapterIds: [] })
  })
})
