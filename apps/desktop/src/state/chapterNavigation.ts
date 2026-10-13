import type { LibraryData } from '../domain/models'

export function sessionAfterRemovingChapter(data: LibraryData, chapterId: string, preferLast = false): LibraryData['session'] {
  const accessible = (id: string) => {
    const chapter = data.chapters[id]
    return chapter && !chapter.deletedAt && data.works.some(work => work.id === chapter.workId && !work.deletedAt && !work.locked)
  }
  const session = data.session
  const openChapterIds = session.openChapterIds.filter(id => id !== chapterId && accessible(id))
  const activeChapterId = session.activeChapterId !== chapterId && accessible(session.activeChapterId)
    ? session.activeChapterId : (preferLast ? openChapterIds.at(-1) : openChapterIds[0]) ?? ''
  return { ...session, openChapterIds, activeChapterId, activeWorkId: data.chapters[activeChapterId]?.workId ?? session.activeWorkId }
}
