import type { LibraryData } from '../../domain/models'

export function continueWriting(data: LibraryData) {
  const works = data.works.filter(work => !work.deletedAt)
  const work = works.find(item => item.id === data.session.activeWorkId) ?? works[0]
  const chapters = Object.values(data.chapters).filter(chapter => chapter.workId === work?.id && !chapter.deletedAt)
  const chapter = work?.locked ? undefined : chapters.find(item => item.id === data.session.activeChapterId)
    ?? (work?.locked ? undefined : [...chapters].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0])
  const words = work?.locked ? 0 : chapters.reduce((total, item) => total + item.wordCount, 0)
  const progress = work && work.targetWords > 0 ? Math.min(100, Math.round(words / work.targetWords * 100)) : 0
  return { work, chapter, words, progress }
}
