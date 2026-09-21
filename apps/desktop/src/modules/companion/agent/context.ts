import type { LibraryData } from '../../../domain/models'
import type { AgentDataAccess } from './applicationServices'
import type { AgentContextSnapshot } from './types'

export interface AgentAccessSnapshot extends AgentDataAccess {
  activeWorkAllowed: boolean
}

export function buildAgentAccess(data: LibraryData, temporaryWorkIds: string[]): AgentAccessSnapshot {
  const grantedWorks = new Set(data.companion.permissions.workIds)
  const grantedChapters = new Set(data.companion.permissions.chapterIds)
  const workIds = new Set<string>()
  const chapterIds = new Set<string>()

  data.works.forEach((work) => {
    const encryptedAllowed = !work.encrypted || (!work.locked && temporaryWorkIds.includes(work.id))
    if (!work.deletedAt && encryptedAllowed && (grantedWorks.has(work.id) || work.chapterIds.some((id) => grantedChapters.has(id)))) workIds.add(work.id)
  })
  Object.values(data.chapters).forEach((chapter) => {
    if (!chapter.deletedAt && workIds.has(chapter.workId) && (grantedWorks.has(chapter.workId) || grantedChapters.has(chapter.id))) chapterIds.add(chapter.id)
  })
  return { workIds, chapterIds, records: data.companion.permissions.records, activeWorkAllowed: workIds.has(data.session.activeWorkId) }
}

export function buildAgentContext(data: LibraryData, access: AgentAccessSnapshot, selection?: string): AgentContextSnapshot {
  const work = access.activeWorkAllowed ? data.works.find((item) => item.id === data.session.activeWorkId) : undefined
  const chapter = access.chapterIds.has(data.session.activeChapterId) ? data.chapters[data.session.activeChapterId] : undefined
  return {
    page: data.session.activeView,
    companion: { name: data.companion.name },
    activeWork: work ? { id: work.id, title: work.title } : undefined,
    activeChapter: chapter ? { id: chapter.id, title: chapter.title } : undefined,
    selection: selection?.trim() || undefined,
  }
}
